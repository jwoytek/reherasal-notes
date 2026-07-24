import React, { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import CustomAlertPanel from './CustomAlertPanel'
import {
  getTimeline, saveTimeline, saveTimelineRemote, getTimelineRemote,
  defaultTimeline, migrateTimeline,
  startNextAct, endCurrentAct, endIntermissionStartNextAct,
  startHold, endHold, isOnHold, getHeldMs, getRunningElapsedMs,
  fmtElapsed, elapsedMs, fmtMsLong,
  getActMs, getIntermissionMs, getCurrentSegmentStart,
  getTotalActsMs, getTotalIntermissionMs, getTotalShowMs,
  isLastAct, actShortName
} from '../lib/showTimeline'

const POLL_INTERVAL = 20000
const TIMELINE_POLL_INTERVAL = 15000
const INTERMISSION_STANDARD = 15 * 60 * 1000 // 15 min

function todayAt(timeStr, dateStr) {
  if (!timeStr || !dateStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date(dateStr + 'T00:00:00')
  d.setHours(h, m, 0, 0)
  return d
}

function secsUntil(target) {
  if (!target) return null
  return Math.round((target - new Date()) / 1000)
}

function fmtCountdown(totalSec) {
  const abs = Math.abs(totalSec)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

// Compare two timeline objects for meaningful equality. Returns true if a poll's
// result matches our current state and we should skip the setState (which would
// cause unnecessary re-renders and DOM destruction).
function timelineEquals(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if (a.phase !== b.phase) return false
  if (a.currentActIndex !== b.currentActIndex) return false
  if (a.totalActs !== b.totalActs) return false
  if (a.holdStart !== b.holdStart) return false
  if (a.totalHoldMs !== b.totalHoldMs) return false
  if (a.lockedBy !== b.lockedBy) return false
  if ((a.actStarts || []).join(',') !== (b.actStarts || []).join(',')) return false
  if ((a.actEnds || []).join(',') !== (b.actEnds || []).join(',')) return false
  if ((a.intermissionStarts || []).join(',') !== (b.intermissionStarts || []).join(',')) return false
  if ((a.intermissionEnds || []).join(',') !== (b.intermissionEnds || []).join(',')) return false
  return true
}

function parseTimeToISO(timeStr, dateStr) {
  if (!timeStr || !dateStr) return null
  try {
    const t = new Date(`${dateStr}T00:00:00`)
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (!match) return null
    let h = parseInt(match[1])
    const m = parseInt(match[2])
    const ampm = match[3]?.toUpperCase()
    if (ampm === 'PM' && h !== 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    t.setHours(h, m, 0, 0)
    return t.toISOString()
  } catch { return null }
}

export default function ShowDayTab({ sheetId, productionCode, production, session, showDayMode, onGoToCheckin }) {
  // Acts configured for this production — drives the timeline state machine.
  // If acts is empty, default to 2 (matches old behavior).
  const productionActs = production?.config?.acts || []
  const totalActs = Math.max(1, productionActs.length || 2)

  const [now, setNow] = useState(new Date())
  const [showDate, setShowDate] = useState(() => new Date().toLocaleDateString('en-CA'))
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [alerting, setAlerting] = useState(false)
  const [alertResult, setAlertResult] = useState(null)
  const [showQR, setShowQR] = useState(false)

  const curtainTimes = (() => {
    const raw = production?.config?.curtainTimes
    if (!raw) return {}
    if (typeof raw === 'object') return raw
    try { return JSON.parse(raw) } catch { return {} }
  })()
  const [curtainTime, setCurtainTime] = useState(curtainTimes[showDate] || '')

  const [timeline, setTimeline] = useState(() => migrateTimeline(defaultTimeline(totalActs)))
  const [lockedBy, setLockedBy] = useState(null)
  const [manualEntry, setManualEntry] = useState(false)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [allTimelines, setAllTimelines] = useState({})
  // Manual form has dynamic fields based on totalActs
  const [manualForm, setManualForm] = useState(buildManualForm(totalActs))
  const timelinePollRef = useRef(null)
  const savingTimelineRef = useRef(false)
  const saveGenerationRef = useRef(0)
  const lastSavedAtRef = useRef(0)

  const isSM = session?.staffRole === 'Stage Manager'
  const isController = isSM && (!lockedBy || lockedBy === session?.name)

  function buildManualForm(n) {
    const f = {}
    for (let i = 0; i < n; i++) {
      f[`act${i}Start`] = ''
      f[`act${i}End`] = ''
      if (i < n - 1) {
        f[`int${i}Start`] = ''
        f[`int${i}End`] = ''
      }
    }
    return f
  }

  // If totalActs changes (e.g. director edits acts mid-session), rebuild manual form
  useEffect(() => {
    setManualForm(buildManualForm(totalActs))
  }, [totalActs])

  async function updateTimeline(changes) {
    if (savingTimelineRef.current) return
    savingTimelineRef.current = true
    saveGenerationRef.current++
    try {
      const next = { ...timeline, ...changes }
      if (!next.lockedBy && isSM) next.lockedBy = session.name
      next.totalActs = next.totalActs || totalActs
      setTimeline(next)
      setLockedBy(next.lockedBy || null)
      await saveTimelineRemote(sheetId, showDate, next)
      lastSavedAtRef.current = Date.now()
    } finally {
      savingTimelineRef.current = false
    }
  }

  async function resetTimeline() {
    if (!confirm('Reset the show timeline? This clears act timers for today.')) return
    const fresh = defaultTimeline(totalActs)
    setTimeline(fresh)
    setLockedBy(null)
    await saveTimelineRemote(sheetId, showDate, fresh)
  }

  // Phase-transition handlers — wrap the lib helpers and persist
  async function handleStartNextAct() {
    if (savingTimelineRef.current) return
    savingTimelineRef.current = true
    saveGenerationRef.current++
    try {
      const next = startNextAct(timeline)
      if (!next.lockedBy && isSM) next.lockedBy = session.name
      next.totalActs = next.totalActs || totalActs
      setTimeline(next)
      setNow(new Date())
      setLockedBy(next.lockedBy || null)
      await saveTimelineRemote(sheetId, showDate, next)
      lastSavedAtRef.current = Date.now()
    } finally { savingTimelineRef.current = false }
  }

  async function handleEndCurrentAct() {
    if (savingTimelineRef.current) return
    savingTimelineRef.current = true
    saveGenerationRef.current++
    try {
      const next = endCurrentAct(timeline)
      if (!next.lockedBy && isSM) next.lockedBy = session.name
      next.totalActs = next.totalActs || totalActs
      setTimeline(next)
      setNow(new Date())
      setLockedBy(next.lockedBy || null)
      await saveTimelineRemote(sheetId, showDate, next)
      lastSavedAtRef.current = Date.now()
    } finally { savingTimelineRef.current = false }
  }

  async function handleEndIntermission() {
    if (savingTimelineRef.current) return
    savingTimelineRef.current = true
    saveGenerationRef.current++
    try {
      const next = endIntermissionStartNextAct(timeline)
      if (!next.lockedBy && isSM) next.lockedBy = session.name
      next.totalActs = next.totalActs || totalActs
      setTimeline(next)
      setNow(new Date())
      setLockedBy(next.lockedBy || null)
      await saveTimelineRemote(sheetId, showDate, next)
      lastSavedAtRef.current = Date.now()
    } finally { savingTimelineRef.current = false }
  }

  async function handleToggleHold() {
    if (savingTimelineRef.current) return
    savingTimelineRef.current = true
    saveGenerationRef.current++
    try {
      const next = isOnHold(timeline) ? endHold(timeline) : startHold(timeline)
      if (!next.lockedBy && isSM) next.lockedBy = session.name
      next.totalActs = next.totalActs || totalActs
      setTimeline(next)
      setNow(new Date())
      setLockedBy(next.lockedBy || null)
      await saveTimelineRemote(sheetId, showDate, next)
      lastSavedAtRef.current = Date.now()
    } finally { savingTimelineRef.current = false }
  }

  async function applyManualEntry() {
    const mf = manualForm
    const actStarts = []
    const actEnds = []
    const intermissionStarts = []
    const intermissionEnds = []
    for (let i = 0; i < totalActs; i++) {
      const s = parseTimeToISO(mf[`act${i}Start`], showDate)
      const e = parseTimeToISO(mf[`act${i}End`], showDate)
      if (s) actStarts.push(s); else if (i === 0) {} else break
      if (e) actEnds.push(e)
      if (i < totalActs - 1) {
        const is = parseTimeToISO(mf[`int${i}Start`], showDate) || e || null
        const ie = parseTimeToISO(mf[`int${i}End`], showDate)
        if (is) intermissionStarts.push(is)
        if (ie) intermissionEnds.push(ie)
      }
    }
    // Determine phase from how many acts/intermissions are filled in
    let phase = 'preshow'
    let currentActIndex = -1
    if (actEnds.length === totalActs && actStarts.length === totalActs) {
      phase = 'done'; currentActIndex = totalActs - 1
    } else if (actStarts.length > actEnds.length) {
      phase = 'running'; currentActIndex = actStarts.length - 1
    } else if (intermissionStarts.length > intermissionEnds.length && intermissionStarts.length > 0) {
      phase = 'intermission'; currentActIndex = intermissionStarts.length - 1
    } else if (actStarts.length > 0) {
      phase = 'running'; currentActIndex = actStarts.length - 1
    }
    const next = {
      ...timeline,
      phase, totalActs, currentActIndex,
      actStarts, actEnds, intermissionStarts, intermissionEnds
    }
    setTimeline(next)
    setLockedBy(next.lockedBy || null)
    await saveTimelineRemote(sheetId, showDate, next)
    setManualEntry(false)
  }

  useEffect(() => {
    async function pollTimeline() {
      if (savingTimelineRef.current) return
      const generationAtFetchStart = saveGenerationRef.current
      const { timeline: remote, lockedBy: lb } = await getTimelineRemote(sheetId, showDate)
      if (savingTimelineRef.current) return
      if (saveGenerationRef.current !== generationAtFetchStart) return
      if (remote) {
        const migrated = migrateTimeline(remote)
        // Only update state if something actually changed — avoids forcing
        // re-renders that destroy the timer DOM subtree.
        setTimeline(prev => {
          if (timelineEquals(prev, migrated)) return prev
          return migrated
        })
        setLockedBy(prev => prev === (lb || null) ? prev : (lb || null))
      }
    }
    pollTimeline()
    timelinePollRef.current = setInterval(pollTimeline, TIMELINE_POLL_INTERVAL)
    return () => clearInterval(timelinePollRef.current)
  }, [sheetId, showDate])

  useEffect(() => {
    const dates = Object.keys(curtainTimes).filter(d => d !== showDate)
    Promise.all(dates.map(async date => {
      const { timeline: remote } = await getTimelineRemote(sheetId, date)
      if (remote) {
        saveTimeline(sheetId, date, remote)
        return [date, migrateTimeline(remote)]
      }
      return [date, getTimeline(sheetId, date)]
    })).then(results => {
      const map = {}
      results.forEach(([date, t]) => { if (t) map[date] = t })
      setAllTimelines(map)
      setHistoryVersion(v => v + 1)
    })
  }, [sheetId, timeline.phase, JSON.stringify(curtainTimes)])

  const [alertsFired, setAlertsFired] = useState({ 60: false, 30: false, 15: false })
  const alertRefs = useRef({})
  const pollRef = useRef(null)

  useEffect(() => {
    setCurtainTime(curtainTimes[showDate] || '')
    setAlertsFired({ 60: false, 30: false, 15: false })
  }, [showDate, production])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [sheetId, showDate])

  useEffect(() => {
    if (!curtainTime || !showDate) return
    Object.values(alertRefs.current).forEach(t => clearTimeout(t))
    alertRefs.current = {}
    const curtain = todayAt(curtainTime, showDate)
    if (!curtain) return
    ;[{ minutes: 60 }, { minutes: 30 }, { minutes: 15 }].forEach(({ minutes }) => {
      const alertAt = new Date(curtain.getTime() - minutes * 60000)
      const msUntil = alertAt - new Date()
      if (msUntil <= 0) return
      alertRefs.current[minutes] = setTimeout(async () => {
        setAlertsFired(prev => ({ ...prev, [minutes]: true }))
        try {
          await api.sendCheckinAlerts({ sheetId, showDate, curtainTime, alertMinutes: minutes, autoFired: true })
        } catch (e) { console.warn('Auto alert failed:', e.message) }
      }, msUntil)
    })
    return () => Object.values(alertRefs.current).forEach(t => clearTimeout(t))
  }, [curtainTime, showDate])

  async function load() {
    try {
      const data = await api.getCheckinStatus(sheetId, showDate)
      setStatus(data)
    } catch (e) { console.warn('Failed to load checkins:', e.message) }
    finally { setLoading(false) }
  }

  async function saveCurtainTime(date, time) {
    const updated = { ...curtainTimes, [date]: time }
    try { await api.updateProduction({ sheetId, config: { curtainTimes: JSON.stringify(updated) } }) } catch {}
  }

  async function sendAlerts(alertTarget = 'staff') {
    setAlerting(true); setAlertResult(null)
    try {
      const result = await api.sendCheckinAlerts({ sheetId, showDate, curtainTime, alertMinutes: 60, alertTarget })
      setAlertResult(result)
    } catch (e) { setAlertResult({ error: e.message }) }
    finally { setAlerting(false) }
  }

  const castList = (status?.castList || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean)
  const checkins = status?.checkins || []
  const checkedInNames = new Set(checkins.map(c => c.castName))
  const manualAbsent = (() => {
    try { return JSON.parse(localStorage.getItem(`rn_checkin_absent_${sheetId}_${showDate}`) || '{}') } catch { return {} }
  })()
  const effectiveCheckins = checkins.filter(c => !manualAbsent[c.castName])
  const missingCast = castList.filter(n => !checkedInNames.has(n) || manualAbsent[n])
  const pct = castList.length ? Math.round((effectiveCheckins.length / castList.length) * 100) : 0
  const checkinUrl = `${window.location.origin}/checkin/${productionCode}/${showDate}`

  const curtain = todayAt(curtainTime, showDate)
  const secsLeft = secsUntil(curtain)
  const curtainPast = secsLeft !== null && secsLeft < 0
  const overCurtainSecs = curtainPast ? Math.abs(secsLeft) : 0

  // Current intermission stats (only meaningful when phase === 'intermission')
  const currentIntIdx = timeline.intermissionStarts.length - 1
  const intermissionMs = currentIntIdx >= 0 ? elapsedMs(timeline.intermissionStarts[currentIntIdx]) : 0
  const intermissionOver = timeline.phase === 'intermission' && intermissionMs > INTERMISSION_STANDARD

  // ---- RunHistory ---------------------------------------------------------

  function RunHistory({ currentDate }) {
    const showDates = Object.keys(curtainTimes).sort()
    if (showDates.length < 2) return null

    function statsForDate(date) {
      const t = date === showDate ? timeline : (allTimelines[date] || getTimeline(sheetId, date))
      if (t.phase !== 'done') return null
      const actMs = (t.actStarts || []).map((_, i) => getActMs(t, i))
      const intMs = (t.intermissionStarts || []).map((_, i) => getIntermissionMs(t, i))
      const totalActs = actMs.reduce((a, b) => a + b, 0)
      const totalInt = intMs.reduce((a, b) => a + b, 0)
      return { actMs, intMs, totalActs, totalInt, total: totalActs + totalInt }
    }

    // Determine the union of column count for the table — use the max acts
    // across any historical row, or the current production's totalActs.
    const allActCounts = showDates.map(d => {
      const t = d === showDate ? timeline : (allTimelines[d] || getTimeline(sheetId, d))
      return t.actStarts?.length || 0
    })
    const maxActs = Math.max(totalActs, ...allActCounts, 1)

    const rows = showDates.map(date => {
      const stats = statsForDate(date)
      const isCurrent = date === currentDate
      const label = new Date(date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      return { date, stats, isCurrent, label }
    })

    if (!rows.some(r => r.stats || r.isCurrent)) return null

    // Build column template: Show | Act 1 | Int 1 | Act 2 | Int 2 | ... | Total
    const cols = ['Show']
    for (let i = 0; i < maxActs; i++) {
      cols.push(`A${i + 1}`)
      if (i < maxActs - 1) cols.push(`I${i + 1}`)
    }
    cols.push('Total')

    const gridTemplate = `1fr ${cols.slice(1).map(() => 'auto').join(' ')}`

    return (
      <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: '12px 14px', marginTop: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Run history</p>
        <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: '4px 10px', alignItems: 'center' }}>
          {cols.map((c, i) => (
            <div key={i} style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i === 0 ? 'left' : 'right' }}>
              {c === 'Show' ? c : c.replace('A', 'Act ').replace('I', 'Int.')}
            </div>
          ))}
          {rows.map(row => {
            const cells = []
            cells.push(
              <div key="label" style={{ fontSize: 11, color: row.isCurrent ? 'var(--purple-text)' : row.stats ? 'var(--text2)' : 'var(--text3)', fontWeight: row.isCurrent ? 700 : 400, display: 'flex', alignItems: 'center', gap: 4 }}>
                {row.isCurrent && <span style={{ fontSize: 8, background: 'var(--purple-text)', color: 'var(--bg3)', borderRadius: 3, padding: '1px 4px', fontWeight: 800 }}>NOW</span>}
                {row.label}
              </div>
            )
            for (let i = 0; i < maxActs; i++) {
              const ms = row.stats?.actMs?.[i] || 0
              cells.push(
                <div key={`a${i}`} style={{ fontSize: 12, fontWeight: row.isCurrent ? 700 : 400, color: ms ? (row.isCurrent ? 'var(--purple-text)' : 'var(--text2)') : 'var(--text3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {ms ? fmtMsLong(ms) : '—'}
                </div>
              )
              if (i < maxActs - 1) {
                const intMs = row.stats?.intMs?.[i] || 0
                const intWarn = intMs > 15 * 60 * 1000
                cells.push(
                  <div key={`i${i}`} style={{ fontSize: 12, fontWeight: row.isCurrent ? 700 : 400, color: intMs ? (intWarn ? 'var(--red-text)' : (row.isCurrent ? 'var(--purple-text)' : 'var(--text2)')) : 'var(--text3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {intMs ? fmtMsLong(intMs) : '—'}
                  </div>
                )
              }
            }
            cells.push(
              <div key="total" style={{ fontSize: 12, fontWeight: row.isCurrent ? 800 : 400, color: row.stats ? (row.isCurrent ? 'var(--text)' : 'var(--text2)') : 'var(--text3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {row.stats ? fmtMsLong(row.stats.total) : '—'}
              </div>
            )
            return <React.Fragment key={row.date}>{cells}</React.Fragment>
          })}
        </div>
      </div>
    )
  }

  // ---- TimelineHeader -----------------------------------------------------

  function TimelineHeader() {
    const phase = timeline.phase
    const lockBanner = !isController && lockedBy ? (
      <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>🔒 Clock controlled by {lockedBy}</p>
    ) : null

    // Reusable controller-or-spectator panel
    function ActionPanel({ children }) {
      if (isController) return children
      return (
        <div style={{ padding: '10px', textAlign: 'center', fontSize: 12, color: 'var(--text3)', border: '1px dashed var(--border2)', borderRadius: 'var(--radius)' }}>
          {lockedBy ? `🔒 Controlled by ${lockedBy}` : '👁 Stage Manager controls the clock'}
        </div>
      )
    }

    if (phase === 'preshow') {
      const overdue = curtainPast
      // Button label: "Start Show" for 1-act, "Start Act 1" otherwise
      const startLabel = totalActs === 1 ? '▶ Start Show' : `▶ Start ${actShortName(0, productionActs)}`
      return (
        <div style={{ background: overdue ? 'var(--red-bg)' : 'var(--purple-bg)', border: overdue ? '1.5px solid var(--red-text)' : 'none', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: overdue ? 'var(--red-text)' : 'var(--text3)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{overdue ? '⚠ CURTAIN OVERDUE' : 'Time to Curtain'}</p>
              <p style={{ fontSize: 11, color: overdue ? 'var(--red-text)' : 'var(--text3)', margin: 0 }}>{production?.config?.title}{curtainTime && ` · Curtain ${new Date(`1970-01-01T${curtainTime}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</p>
            </div>
            <div style={{ fontSize: 11, color: overdue ? 'var(--red-text)' : 'var(--text3)' }}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
          </div>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {!curtainTime ? (
              <p style={{ fontSize: 16, color: 'var(--text3)' }}>Set curtain time below</p>
            ) : overdue ? (
              <div>
                <div style={{ fontSize: 56, fontWeight: 900, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>+{fmtCountdown(overCurtainSecs)}</div>
                <p style={{ fontSize: 13, color: 'var(--red-text)', marginTop: 6 }}>over scheduled curtain — {totalActs === 1 ? 'start show' : 'start Act 1'} when ready</p>
              </div>
            ) : (
              <div style={{ fontSize: 56, fontWeight: 900, color: secsLeft < 600 ? 'var(--amber-text)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtCountdown(secsLeft)}</div>
            )}
          </div>
          <ActionPanel>
            <button onClick={handleStartNextAct} className="btn btn-primary"
              style={{ width: '100%', marginTop: 12, padding: '12px', fontSize: 15, fontWeight: 700 }}>
              {startLabel}
            </button>
          </ActionPanel>
          {lockBanner}
          <RunHistory currentDate={showDate} />
        </div>
      )
    }

    if (phase === 'running') {
      const actIdx = timeline.currentActIndex
      const actName = actShortName(actIdx, productionActs)
      const actStart = timeline.actStarts[actIdx]
      const last = isLastAct(timeline)
      // Button: "End Show" if last act, else "Start Intermission"
      const endLabel = last
        ? '🎉 End Show'
        : `⏸ Start Intermission${totalActs > 2 ? ` ${actIdx + 1}` : ''}`
      const endColor = last
        ? 'transparent'
        : 'var(--amber-text)'
      const endTextColor = last ? 'var(--text)' : 'var(--bg3)'
      const endBorder = last ? '1.5px solid var(--text2)' : 'none'

      return (
        <div style={{ background: 'var(--purple-bg)', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text3)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Now Playing</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', margin: '2px 0 0', letterSpacing: '-0.5px', lineHeight: 1 }}>{actName}</p>
              <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>Started {new Date(actStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</div>
          </div>
          {(() => {
            const onHold = isOnHold(timeline)
            const liveMs = getRunningElapsedMs(timeline, now.getTime())
            const heldMs = timeline.totalHoldMs || 0
            const liveHeldMs = getHeldMs(timeline, now.getTime())
            return (
              <>
                <div style={{ fontSize: 44, fontWeight: 900, color: onHold ? 'var(--amber-text)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', textAlign: 'center', lineHeight: 1, marginBottom: 4 }}>
                  {fmtMsLong(liveMs)}
                </div>
                {onHold ? (
                  <p style={{ fontSize: 12, color: 'var(--amber-text)', textAlign: 'center', margin: '0 0 8px', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                    ⏸ HELD · {fmtMsLong(liveHeldMs)} this hold
                  </p>
                ) : heldMs > 0 ? (
                  <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', margin: '0 0 8px' }}>
                    {fmtMsLong(heldMs)} held this act
                  </p>
                ) : (
                  <div style={{ height: 8, marginBottom: 8 }} />
                )}
              </>
            )
          })()}
          <ActionPanel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button onClick={handleToggleHold}
                style={{ background: isOnHold(timeline) ? 'var(--green-text)' : 'var(--amber-bg)', border: `1px solid ${isOnHold(timeline) ? 'transparent' : 'var(--amber-text)'}`, borderRadius: 'var(--radius)', padding: '12px', fontSize: 14, fontWeight: 700, color: isOnHold(timeline) ? 'var(--bg3)' : 'var(--amber-text)', cursor: 'pointer' }}>
                {isOnHold(timeline) ? '▶ Resume' : '⏸ Hold'}
              </button>
              <button onClick={handleEndCurrentAct} disabled={isOnHold(timeline)}
                style={{ background: endColor, border: endBorder, borderRadius: 'var(--radius)', padding: '12px', fontSize: 14, fontWeight: 700, color: endTextColor, cursor: isOnHold(timeline) ? 'not-allowed' : 'pointer', opacity: isOnHold(timeline) ? 0.4 : 1 }}>
                {endLabel}
              </button>
            </div>
          </ActionPanel>
          {lockBanner}
          <RunHistory currentDate={showDate} />
        </div>
      )
    }

    if (phase === 'intermission') {
      const intIdx = currentIntIdx  // index of the running intermission
      const intStart = timeline.intermissionStarts[intIdx]
      const nextActIdx = intIdx + 1  // intermission N runs between act N and act N+1
      const nextActName = actShortName(nextActIdx, productionActs)
      const intLabel = totalActs > 2 ? `Intermission ${intIdx + 1}` : 'Intermission'
      return (
        <div style={{ background: intermissionOver ? 'var(--red-bg)' : 'var(--purple-bg)', border: intermissionOver ? '1.5px solid var(--red-text)' : 'none', borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 14, transition: 'background 0.5s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: intermissionOver ? 'var(--red-text)' : 'var(--text3)', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{intermissionOver ? `⏰ ${intLabel.toUpperCase()} OVER TIME` : intLabel}</p>
              <p style={{ fontSize: 11, color: intermissionOver ? 'var(--red-text)' : 'var(--text3)', margin: 0 }}>Started {new Date(intStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</div>
          </div>
          {(() => {
            const onHold = isOnHold(timeline)
            const liveMs = getRunningElapsedMs(timeline, now.getTime())
            const heldMs = timeline.totalHoldMs || 0
            const liveHeldMs = getHeldMs(timeline, now.getTime())
            return (
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                {intermissionOver ? (
                  <div>
                    <div style={{ fontSize: 52, fontWeight: 900, color: onHold ? 'var(--amber-text)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      +{fmtMsLong(Math.max(0, liveMs - INTERMISSION_STANDARD))}
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--red-text)', marginTop: 4 }}>over 15 minutes</p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 52, fontWeight: 900, color: onHold ? 'var(--amber-text)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {fmtMsLong(liveMs)}
                    </div>
                    <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 3, margin: '8px 0 0', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, (liveMs / INTERMISSION_STANDARD) * 100)}%`, background: liveMs > INTERMISSION_STANDARD * 0.8 ? 'var(--amber-text)' : 'var(--purple-text)', transition: 'width 1s linear' }} />
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>of standard 15:00</p>
                  </div>
                )}
                {onHold ? (
                  <p style={{ fontSize: 12, color: 'var(--amber-text)', textAlign: 'center', margin: '6px 0 0', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                    ⏸ HELD · {fmtMsLong(liveHeldMs)} this hold
                  </p>
                ) : heldMs > 0 ? (
                  <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', margin: '4px 0 0' }}>
                    {fmtMsLong(heldMs)} held during this intermission
                  </p>
                ) : null}
              </div>
            )
          })()}
          <ActionPanel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button onClick={handleToggleHold}
                style={{ background: isOnHold(timeline) ? 'var(--green-text)' : 'var(--amber-bg)', border: `1px solid ${isOnHold(timeline) ? 'transparent' : 'var(--amber-text)'}`, borderRadius: 'var(--radius)', padding: '12px', fontSize: 14, fontWeight: 700, color: isOnHold(timeline) ? 'var(--bg3)' : 'var(--amber-text)', cursor: 'pointer' }}>
                {isOnHold(timeline) ? '▶ Resume' : '⏸ Hold'}
              </button>
              <button onClick={handleEndIntermission} disabled={isOnHold(timeline)}
                style={{ background: 'var(--green-text)', border: 'none', borderRadius: 'var(--radius)', padding: '12px', fontSize: 14, fontWeight: 700, color: 'var(--bg3)', cursor: isOnHold(timeline) ? 'not-allowed' : 'pointer', opacity: isOnHold(timeline) ? 0.4 : 1 }}>
                ▶ Call {nextActName}
              </button>
            </div>
          </ActionPanel>
          {lockBanner}
          <RunHistory currentDate={showDate} />
        </div>
      )
    }

    // DONE
    const totalActsRun = timeline.actStarts.length
    return (
      <div style={{ background: 'var(--purple-bg)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', marginBottom: 14 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 24, margin: 0 }}>🎉</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '4px 0 2px' }}>Show complete!</p>
          <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>{production?.config?.title}{timeline.perfNum ? ` · Performance ${timeline.perfNum}` : ''}</p>
        </div>

        {/* Per-act breakdown */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(totalActsRun + (totalActsRun - 1), 5)}, 1fr)`,
          gap: 8,
          marginBottom: 12
        }}>
          {(() => {
            const cells = []
            for (let i = 0; i < totalActsRun; i++) {
              const ms = getActMs(timeline, i)
              const start = timeline.actStarts[i]
              const end = timeline.actEnds[i]
              cells.push(
                <div key={`a${i}`} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{actShortName(i, productionActs)}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{start ? fmtMsLong(ms) : '—'}</p>
                  {start && <p style={{ fontSize: 9, color: 'var(--text3)', margin: '3px 0 0' }}>{new Date(start).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} → {end ? new Date(end).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}) : '?'}</p>}
                </div>
              )
              if (i < totalActsRun - 1) {
                const intMs = getIntermissionMs(timeline, i)
                const intStart = timeline.intermissionStarts[i]
                const intEnd = timeline.intermissionEnds[i]
                const warn = intMs > 15 * 60 * 1000
                const intLabel = totalActsRun > 2 ? `Int. ${i + 1}` : 'Intermission'
                cells.push(
                  <div key={`i${i}`} style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{intLabel}</p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: warn ? 'var(--red-text)' : 'var(--text)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{intStart ? fmtMsLong(intMs) : '—'}</p>
                    {intStart && <p style={{ fontSize: 9, color: 'var(--text3)', margin: '3px 0 0' }}>{new Date(intStart).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} → {intEnd ? new Date(intEnd).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}) : '?'}</p>}
                  </div>
                )
              }
            }
            return cells
          })()}
        </div>

        <div style={{ borderTop: '0.5px solid var(--border)', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Show time</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--purple-text)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtMsLong(getTotalActsMs(timeline))}</p>
            <p style={{ fontSize: 9, color: 'var(--text3)', margin: '2px 0 0' }}>acts only</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: 'var(--text3)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total running</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtMsLong(getTotalShowMs(timeline))}</p>
            <p style={{ fontSize: 9, color: 'var(--text3)', margin: '2px 0 0' }}>{totalActsRun > 1 ? 'including intermission(s)' : 'top to bottom'}</p>
          </div>
        </div>
        {(timeline.totalHoldMs || 0) > 0 && (
          <div style={{ textAlign: 'center', padding: '8px 12px', background: 'var(--amber-bg)', borderRadius: 8, marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: 'var(--amber-text)', margin: 0 }}>
              ⏸ {fmtMsLong(timeline.totalHoldMs)} on hold during this run
            </p>
          </div>
        )}
        {isController && (
          <button onClick={resetTimeline}
            style={{ width: '100%', background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '8px 14px', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>
            Reset for next performance
          </button>
        )}
        <RunHistory currentDate={showDate} />
      </div>
    )
  }

  // ---- Manual entry fields (built dynamically based on totalActs) --------

  const manualFields = (() => {
    const out = []
    for (let i = 0; i < totalActs; i++) {
      out.push({ key: `act${i}Start`, label: `${actShortName(i, productionActs)} Start` })
      out.push({ key: `act${i}End`, label: `${actShortName(i, productionActs)} End` })
      if (i < totalActs - 1) {
        const intLabel = totalActs > 2 ? `Intermission ${i + 1}` : 'Intermission'
        out.push({ key: `int${i}Start`, label: `${intLabel} Start (if different)` })
        out.push({ key: `int${i}End`, label: `${intLabel} End` })
      }
    }
    return out
  })()

  return (
    <div>
      {manualEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Enter show times manually</h2>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: '1rem' }}>Enter times in any format: 7:32 PM, 19:32, 8:05 PM</p>
            {manualFields.map(f => (
              <div key={f.key} className="field" style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12 }}>{f.label}</label>
                <input type="text" placeholder="e.g. 7:32 PM" value={manualForm[f.key] || ''}
                  onChange={e => setManualForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  style={{ fontSize: 13 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={applyManualEntry}>Apply times</button>
              <button className="btn" onClick={() => setManualEntry(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <TimelineHeader />

      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0, flex: '0 0 auto' }}>
            <label style={{ fontSize: 11 }}>Show date</label>
            <input type="date" value={showDate} onChange={e => setShowDate(e.target.value)} style={{ fontSize: 13, padding: '5px 8px' }} />
          </div>
          <div className="field" style={{ margin: 0, flex: '0 0 auto' }}>
            <label style={{ fontSize: 11 }}>Curtain time{curtainTimes[showDate] && <span style={{ color: 'var(--green-text)', marginLeft: 4 }}>✓ saved</span>}</label>
            <input type="time" value={curtainTime}
              onChange={e => { setCurtainTime(e.target.value); setAlertsFired({ 60: false, 30: false, 15: false }) }}
              onBlur={e => { if (e.target.value) saveCurtainTime(showDate, e.target.value) }}
              style={{ fontSize: 13, padding: '5px 8px', width: 110 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button className="btn btn-sm" onClick={load} style={{ fontSize: 11 }}>↻</button>
            <button className="btn btn-sm" onClick={() => setManualEntry(true)} style={{ fontSize: 11 }}>✏ Enter times</button>
            {isController && timeline.phase !== 'preshow' && (
              <button className="btn btn-sm" onClick={resetTimeline} style={{ fontSize: 11 }}>Reset timeline</button>
            )}
          </div>
        </div>
        {curtainTime && curtain && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>
            📲 Auto alerts:
            {[60, 30, 15].map(m => {
              const fired = alertsFired[m]
              const alertAt = new Date(curtain.getTime() - m * 60000)
              const timeLabel = alertAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              return (
                <span key={m} style={{ marginLeft: 8, color: fired ? 'var(--green-text)' : 'var(--text2)' }}>
                  {fired ? '✓' : '○'} {m}min ({timeLabel})
                </span>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{effectiveCheckins.length} / {castList.length} checked in</p>
          <span style={{ fontSize: 14, fontWeight: 600, color: pct === 100 ? 'var(--green-text)' : pct > 75 ? 'var(--amber-text)' : 'var(--red-text)' }}>{pct}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 4, transition: 'width 0.5s', width: `${pct}%`, background: pct === 100 ? 'var(--green-text)' : pct > 75 ? 'var(--amber-text)' : 'var(--red-text)' }} />
        </div>
        {pct === 100
          ? <p style={{ fontSize: 12, color: 'var(--green-text)', marginTop: 6, fontWeight: 500 }}>✅ Full house — everyone's in!</p>
          : castList.length > 0 && <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>{missingCast.length} still needed</p>
        }
      </div>

      <button onClick={onGoToCheckin}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.875rem 1rem', marginBottom: 12, background: 'var(--bg2)', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', color: 'var(--text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Cast Check-in</p>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>QR code, live list, manual check-in</p>
          </div>
        </div>
        <span style={{ fontSize: 18, color: 'var(--text3)' }}>→</span>
      </button>

      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>📱 Cast check-in link</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', wordBreak: 'break-all' }}>{checkinUrl}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(checkinUrl)} style={{ fontSize: 11 }}>Copy</button>
            <button className="btn btn-sm" onClick={() => setShowQR(q => !q)} style={{ fontSize: 11 }}>QR</button>
          </div>
        </div>
        {showQR && (
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkinUrl)}`}
              alt="Check-in QR code" style={{ width: 180, height: 180, borderRadius: 8 }} />
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Display at stage door</p>
          </div>
        )}
      </div>

      <CustomAlertPanel sheetId={sheetId} production={production} isShowDay={true} />

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
          <button className="btn btn-sm" onClick={() => sendAlerts('staff')} disabled={alerting}
            style={{ background: 'var(--blue-bg)', color: 'var(--blue-text)', borderColor: 'transparent', fontWeight: 500, fontSize: 12 }}>
            {alerting ? '…' : '📲 Alert Staff'}
          </button>
          <button className="btn btn-sm" onClick={() => sendAlerts('cast')} disabled={alerting}
            style={{ background: 'var(--amber-bg)', color: 'var(--amber-text)', borderColor: 'transparent', fontWeight: 500, fontSize: 12 }}>
            {alerting ? '…' : `⚠ Alert Cast (${missingCast.length})`}
          </button>
          <button className="btn btn-sm" onClick={() => sendAlerts('all')} disabled={alerting}
            style={{ background: 'var(--red-bg)', color: 'var(--red-text)', borderColor: 'transparent', fontWeight: 500, fontSize: 12 }}>
            {alerting ? '…' : '🔔 Alert All'}
          </button>
        </div>
        {alertResult && (
          <div style={{ marginTop: 8, padding: '0.75rem', background: alertResult.error ? 'var(--red-bg)' : 'var(--bg2)', border: `0.5px solid ${alertResult.error ? 'var(--red-text)' : 'var(--border)'}`, borderRadius: 'var(--radius)', fontSize: 13 }}>
            {alertResult.error
              ? <p style={{ color: 'var(--red-text)' }}>⚠ {alertResult.error}</p>
              : <>
                {alertResult.alerted?.length > 0 && <p style={{ color: 'var(--green-text)', marginBottom: 2 }}>✓ Alerted: {alertResult.alerted.join(', ')}</p>}
                {alertResult.failed?.length > 0 && <p style={{ color: 'var(--red-text)' }}>✗ Failed: {alertResult.failed.map(f => f.name).join(', ')}</p>}
                {!alertResult.alerted?.length && !alertResult.failed?.length && <p style={{ color: 'var(--text2)' }}>No notification contacts on file.</p>}
              </>
            }
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--red-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>⚠ Missing ({missingCast.length})</p>
          {missingCast.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Everyone's in! 🎉</p>
            : missingCast.map(n => (
                <div key={n} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 'var(--radius)', background: 'var(--red-bg)', border: '0.5px solid var(--red-text)', fontSize: 13, color: 'var(--red-text)', fontWeight: 500 }}>{n}</div>
              ))
          }
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>✅ Present ({effectiveCheckins.length})</p>
          {effectiveCheckins.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>No check-ins yet</p>
            : effectiveCheckins.map(c => (
                <div key={c.castName} style={{ padding: '8px 10px', marginBottom: 4, borderRadius: 'var(--radius)', background: 'var(--bg2)', border: '0.5px solid var(--border)', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontWeight: 500 }}>{c.castName}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{new Date(c.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  {c.note && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{c.note}</p>}
                </div>
              ))
          }
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 14 }}>Auto-refreshes every 20 seconds</p>
    </div>
  )
}
