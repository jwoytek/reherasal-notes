// Per-performance timeline state, generic over N acts.
//
// Shape (new):
//   {
//     phase: 'preshow' | 'running' | 'intermission' | 'done',
//     totalActs: number,                    // snapshot at start; phase machine respects this
//     currentActIndex: number,              // 0-based; index of currently-running act (or last completed)
//     actStarts: string[],                  // ISO timestamps; length grows as acts begin
//     actEnds: string[],                    // parallel to actStarts
//     intermissionStarts: string[],         // length grows as intermissions begin
//     intermissionEnds: string[],           // parallel
//     lockedBy: string|null,
//     holdStart: string|null,
//     totalHoldMs: number,
//     perfNum?: number,
//     showEnd?: string,
//     // Legacy mirror fields (written for back-compat with old consumers):
//     act1Start, act1End, intermissionStart, intermissionEnd, act2Start, act2End
//   }
//
// Old shape (read-only support):
//   { phase: 'preshow'|'act1'|'intermission'|'act2'|'done',
//     act1Start, act1End, intermissionStart, intermissionEnd, act2Start, act2End,
//     lockedBy, holdStart, totalHoldMs }

const KEY = (sheetId, showDate) => `rn_timeline_${sheetId}_${showDate}`

export function getTimeline(sheetId, showDate) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(sheetId, showDate)) || 'null')
    if (!raw) return defaultTimeline()
    const migrated = migrateTimeline(raw)
    // If we just migrated old → new, persist so the next read is faster
    if (!Array.isArray(raw.actStarts)) {
      try { localStorage.setItem(KEY(sheetId, showDate), JSON.stringify(withLegacyMirror(migrated))) } catch {}
    }
    return migrated
  } catch { return defaultTimeline() }
}

export function saveTimeline(sheetId, showDate, state) {
  localStorage.setItem(KEY(sheetId, showDate), JSON.stringify(state))
}

export async function saveTimelineRemote(sheetId, showDate, timeline) {
  // Mirror to legacy fields before save so SMDashboard / IntermissionDashboard / etc.
  // keep working without changes.
  const withLegacy = withLegacyMirror(timeline)
  try {
    await fetch('/.netlify/functions/saveTimeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, showDate, timeline: withLegacy })
    })
    saveTimeline(sheetId, showDate, withLegacy)
  } catch (e) {
    console.warn('Remote timeline save failed:', e.message)
    saveTimeline(sheetId, showDate, withLegacy)
  }
}

export async function getTimelineRemote(sheetId, showDate) {
  try {
    const res = await fetch(
      `/.netlify/functions/getTimeline?sheetId=${sheetId}&showDate=${showDate}`,
      { cache: 'no-store' }
    )
    if (!res.ok) {
      // Don't try to parse non-OK responses (may be HTML error pages)
      return { timeline: getTimeline(sheetId, showDate), lockedBy: '' }
    }
    const data = await res.json()
    if (data.timeline) {
      const migrated = migrateTimeline(data.timeline)
      // Persist the MIGRATED shape so subsequent local reads get the new fields
      saveTimeline(sheetId, showDate, withLegacyMirror(migrated))
      return { timeline: migrated, lockedBy: data.lockedBy || '' }
    }
  } catch (e) {
    console.warn('Remote timeline fetch failed:', e.message)
  }
  return { timeline: getTimeline(sheetId, showDate), lockedBy: '' }
}

export function defaultTimeline(totalActs = 2) {
  return {
    phase: 'preshow',
    totalActs,
    currentActIndex: -1,
    actStarts: [],
    actEnds: [],
    intermissionStarts: [],
    intermissionEnds: [],
    lockedBy: null,
    holdStart: null,
    totalHoldMs: 0,
    // Legacy mirrors — start null
    act1Start: null,
    act1End: null,
    intermissionStart: null,
    intermissionEnd: null,
    act2Start: null,
    act2End: null,
  }
}

// ---------- Migration ------------------------------------------------------

// Detect old-shape rows and convert them to the new shape. Idempotent — calling
// migrateTimeline() on a new-shape row returns it unchanged (with any missing
// fields filled in).
export function migrateTimeline(t) {
  if (!t || typeof t !== 'object') return defaultTimeline()

  // Already new shape if it has actStarts as an array
  const isNew = Array.isArray(t.actStarts)

  if (isNew) {
    // Just ensure all expected fields exist, normalize phase
    return normalizeNewShape(t)
  }

  // OLD shape — translate
  const actStarts = []
  const actEnds = []
  const intermissionStarts = []
  const intermissionEnds = []

  if (t.act1Start) actStarts.push(t.act1Start)
  if (t.act1End) actEnds.push(t.act1End)
  if (t.intermissionStart) intermissionStarts.push(t.intermissionStart)
  if (t.intermissionEnd) intermissionEnds.push(t.intermissionEnd)
  if (t.act2Start) actStarts.push(t.act2Start)
  if (t.act2End) actEnds.push(t.act2End)

  // Translate phase
  let phase = 'preshow'
  let currentActIndex = -1
  if (t.phase === 'preshow') {
    phase = 'preshow'; currentActIndex = -1
  } else if (t.phase === 'act1') {
    phase = 'running'; currentActIndex = 0
  } else if (t.phase === 'intermission') {
    phase = 'intermission'; currentActIndex = 0  // act 0 just ended; intermission 0 underway
  } else if (t.phase === 'act2') {
    phase = 'running'; currentActIndex = 1
  } else if (t.phase === 'done') {
    phase = 'done'; currentActIndex = Math.max(0, actStarts.length - 1)
  }

  // We can only reasonably infer totalActs from old data: 2 if any act2 timestamp
  // exists, else 1. (3-act shows didn't exist in the old shape.)
  const totalActs = (t.act2Start || t.act2End || actStarts.length >= 2) ? 2 : 2  // default 2 for safety

  return normalizeNewShape({
    phase, totalActs, currentActIndex,
    actStarts, actEnds, intermissionStarts, intermissionEnds,
    lockedBy: t.lockedBy || null,
    holdStart: t.holdStart || null,
    totalHoldMs: t.totalHoldMs || 0,
    perfNum: t.perfNum,
    showEnd: t.showEnd,
    // Keep originals as legacy mirrors
    act1Start: t.act1Start || null,
    act1End: t.act1End || null,
    intermissionStart: t.intermissionStart || null,
    intermissionEnd: t.intermissionEnd || null,
    act2Start: t.act2Start || null,
    act2End: t.act2End || null,
  })
}

function normalizeNewShape(t) {
  const base = defaultTimeline(t.totalActs || 2)
  return {
    ...base,
    ...t,
    actStarts: Array.isArray(t.actStarts) ? t.actStarts : [],
    actEnds: Array.isArray(t.actEnds) ? t.actEnds : [],
    intermissionStarts: Array.isArray(t.intermissionStarts) ? t.intermissionStarts : [],
    intermissionEnds: Array.isArray(t.intermissionEnds) ? t.intermissionEnds : [],
    totalActs: t.totalActs || 2,
    currentActIndex: typeof t.currentActIndex === 'number' ? t.currentActIndex : -1,
  }
}

// Mirror new-shape arrays onto the legacy field names so older consumers
// (SMDashboard, IntermissionDashboard, ProductionClosed) still work unchanged.
function withLegacyMirror(t) {
  return {
    ...t,
    act1Start: t.actStarts?.[0] || null,
    act1End: t.actEnds?.[0] || null,
    intermissionStart: t.intermissionStarts?.[0] || null,
    intermissionEnd: t.intermissionEnds?.[0] || null,
    act2Start: t.actStarts?.[1] || null,
    act2End: t.actEnds?.[1] || null,
  }
}

// ---------- Phase transitions ---------------------------------------------

// Begin the next act. Used to start act 1 (from preshow), or to start act N+1
// (from intermission).
export function startNextAct(t, atIso = new Date().toISOString()) {
  const base = migrateTimeline(t)
  const next = { ...base }
  next.actStarts = [...(base.actStarts || []), atIso]
  next.actEnds = [...(base.actEnds || [])]
  next.currentActIndex = next.actStarts.length - 1
  next.phase = 'running'
  return withLegacyMirror(next)
}

// End the currently-running act. If there are more acts to come, begin
// intermission. If this was the last act, mark the show done.
export function endCurrentAct(t, atIso = new Date().toISOString()) {
  const base = migrateTimeline(t)
  const next = { ...base }
  const idx = next.currentActIndex
  if (idx < 0 || idx === undefined || idx === null) return base  // nothing running
  // Pad actEnds so we can write at idx
  const ends = [...(t.actEnds || [])]
  while (ends.length <= idx) ends.push(null)
  ends[idx] = atIso
  next.actEnds = ends

  const isLastAct = (idx + 1) >= (t.totalActs || 2)
  if (isLastAct) {
    next.phase = 'done'
    next.showEnd = atIso
  } else {
    next.phase = 'intermission'
    next.intermissionStarts = [...(t.intermissionStarts || []), atIso]
  }
  return withLegacyMirror(next)
}

// End the current intermission and begin the next act.
export function endIntermissionStartNextAct(t, atIso = new Date().toISOString()) {
  const base = migrateTimeline(t)
  const next = { ...base }
  const intIdx = (next.intermissionStarts || []).length - 1
  if (intIdx >= 0) {
    const ends = [...(t.intermissionEnds || [])]
    while (ends.length <= intIdx) ends.push(null)
    ends[intIdx] = atIso
    next.intermissionEnds = ends
  }
  return startNextAct(next, atIso)
}

// ---------- Computed helpers ----------------------------------------------

export function getActMs(t, idx) {
  const start = t.actStarts?.[idx]
  const end = t.actEnds?.[idx]
  if (!start) return 0
  if (!end) return Date.now() - new Date(start).getTime()
  return new Date(end).getTime() - new Date(start).getTime()
}

export function getIntermissionMs(t, idx) {
  const start = t.intermissionStarts?.[idx]
  const end = t.intermissionEnds?.[idx]
  if (!start) return 0
  if (!end) return Date.now() - new Date(start).getTime()
  return new Date(end).getTime() - new Date(start).getTime()
}

export function getCurrentSegmentStart(t) {
  if (t.phase === 'running') return t.actStarts?.[t.currentActIndex] || null
  if (t.phase === 'intermission') {
    const idx = t.intermissionStarts.length - 1
    return idx >= 0 ? t.intermissionStarts[idx] : null
  }
  return null
}

export function getTotalActsMs(t) {
  return (t.actStarts || []).reduce((sum, _, i) => sum + getActMs(t, i), 0)
}

export function getTotalIntermissionMs(t) {
  return (t.intermissionStarts || []).reduce((sum, _, i) => sum + getIntermissionMs(t, i), 0)
}

export function getTotalShowMs(t) {
  return getTotalActsMs(t) + getTotalIntermissionMs(t)
}

// Are we in the last act or intermission?
export function isLastAct(t) {
  return t.currentActIndex >= (t.totalActs - 1)
}

// ---------- Hold (pause) ---------------------------------------------------

// Begin a hold. The visible timer pauses; on resume, the held duration is
// added to totalHoldMs so net elapsed time stays accurate.
export function startHold(t, atIso = new Date().toISOString()) {
  const base = migrateTimeline(t)
  if (base.holdStart) return base  // already on hold; no-op
  return withLegacyMirror({ ...base, holdStart: atIso })
}

// End the current hold, adding the held duration to totalHoldMs.
export function endHold(t, atIso = new Date().toISOString()) {
  const base = migrateTimeline(t)
  if (!base.holdStart) return base
  const heldMs = new Date(atIso).getTime() - new Date(base.holdStart).getTime()
  return withLegacyMirror({
    ...base,
    holdStart: null,
    totalHoldMs: (base.totalHoldMs || 0) + Math.max(0, heldMs)
  })
}

export function isOnHold(t) { return !!t?.holdStart }

// Held milliseconds, including any in-progress hold (for live display).
export function getHeldMs(t, nowMs = Date.now()) {
  const base = t.totalHoldMs || 0
  if (!t.holdStart) return base
  return base + Math.max(0, nowMs - new Date(t.holdStart).getTime())
}

// Net (display) elapsed for the currently-running act/intermission.
// Subtracts cumulative hold time so the visible clock pauses when held.
export function getRunningElapsedMs(t, nowMs = Date.now()) {
  const start = getCurrentSegmentStart(t)
  if (!start) return 0
  const raw = nowMs - new Date(start).getTime()
  return Math.max(0, raw - getHeldMs(t, nowMs))
}

// ---------- Formatting helpers --------------------------------------------

export function fmtElapsed(startIso, endIso = null) {
  if (!startIso) return '0:00'
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const totalSec = Math.floor(Math.abs(end - new Date(startIso).getTime()) / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2,'0')}`
}

export function elapsedMs(startIso, endIso = null) {
  if (!startIso) return 0
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  return end - new Date(startIso).getTime()
}

export function fmtMsLong(ms) {
  if (!ms) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

// Convenience: convert an act index to a display name like "Act One", "Act Two"
const ROMAN = ['One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten']
export function actDisplayName(idx, acts) {
  // If we have configured acts, use the actual name when possible
  if (Array.isArray(acts) && acts[idx]) {
    const sortedActs = [...acts].sort((a,b) => (a.order||0)-(b.order||0))
    if (sortedActs[idx]) return sortedActs[idx].name
  }
  return idx < ROMAN.length ? `Act ${ROMAN[idx]}` : `Act ${idx + 1}`
}

// Short version for buttons / labels
export function actShortName(idx, acts) {
  if (Array.isArray(acts) && acts[idx]) {
    const sortedActs = [...acts].sort((a,b) => (a.order||0)-(b.order||0))
    if (sortedActs[idx]) return sortedActs[idx].name
  }
  return `Act ${idx + 1}`
}
