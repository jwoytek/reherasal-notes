import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { parseHashtags } from '../lib/hashtags'
import { castNameList } from '../lib/castUtils'
import { getTimeline, saveTimeline, saveTimelineRemote, getTimelineRemote, defaultTimeline, fmtElapsed, elapsedMs } from '../lib/showTimeline'

const INTERMISSION_STANDARD = 15 * 60 * 1000
const REPORT_DELAY_MINUTES = 30
const TIMELINE_POLL_INTERVAL = 15000

function fmtMs(ms) {
  if (!ms) return '—'
  const totalSec = Math.floor(Math.abs(ms) / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${m}:${String(s).padStart(2,'0')}`
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
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

// Compute elapsed accounting for pause
function fmtElapsedWithPause(startIso, pausedAt, totalPausedMs) {
  if (!startIso) return '0:00'
  const end = pausedAt ? new Date(pausedAt).getTime() : Date.now()
  const raw = end - new Date(startIso).getTime() - (totalPausedMs || 0)
  const totalSec = Math.floor(Math.abs(raw) / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function SMDashboard({ sheetId, productionCode, production, session, notes, characters, scenes, onNoteAdded, onNoteUpdated }) {
  const today = new Date().toLocaleDateString('en-CA')
  const [showDate, setShowDate] = useState(today)

  // Timeline
  const [timeline, setTimeline] = useState(defaultTimeline)
  const [lockedBy, setLockedBy] = useState(null)
  const [savingTimeline, setSavingTimeline] = useState(false) // keep for button UI
  const savingTimelineRef = useRef(false)
  const timelinePollRef = useRef(null)

  // Manual time entry
  const [manualEntry, setManualEntry] = useState(false)
  const [manualForm, setManualForm] = useState({ act1Start: '', act1End: '', intermissionStart: '', intermissionEnd: '', act2Start: '', act2End: '' })

  // Performance notes
  const [noteText, setNoteText] = useState('')
  const [noteCategory, setNoteCategory] = useState('general')
  const [savingNote, setSavingNote] = useState(false)
  const [recentNotes, setRecentNotes] = useState([])

  // Post-show report
  const [reportCountdown, setReportCountdown] = useState(null)
  const [reportFired, setReportFired] = useState(false)
  const [reportSending, setReportSending] = useState(false)
  const [reportResult, setReportResult] = useState(null) // { sent, message, reportPreview }
  const [closingNote, setClosingNote] = useState('')
  const reportTimerRef = useRef(null)
  const countdownRef = useRef(null)

  // Check-in data
  const [checkinStatus, setCheckinStatus] = useState(null)

  // Tick for live clock display
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const isSM = session?.staffRole === 'Stage Manager'
  const isController = (isSM || session?.staffRole === 'Asst. SM' || session?.staffRole === 'Assistant SM') && (!lockedBy || lockedBy === session?.name)
  const canEdit = ['Stage Manager', 'Asst. SM', 'Assistant SM', 'Director', 'Asst. Director', 'Assistant Director'].includes(session?.staffRole) || session?.role === 'admin'

  const curtainTimes = (() => {
    const raw = production?.config?.curtainTimes
    if (!raw) return {}
    if (typeof raw === 'object') return raw
    try { return JSON.parse(raw) } catch { return {} }
  })()

  // Poll timeline
  const PHASE_ORDER = { preshow: 0, act1: 1, intermission: 2, act2: 3, done: 4 }
  useEffect(() => {
    async function poll() {
      if (savingTimelineRef.current) return
      const { timeline: remote, lockedBy: lb } = await getTimelineRemote(sheetId, showDate)
      if (remote) {
        // Don't regress to an earlier phase (stale data from race condition)
        setTimeline(prev => {
          const prevPhase = PHASE_ORDER[prev.phase] ?? 0
          const remotePhase = PHASE_ORDER[remote.phase] ?? 0
          // Only apply remote if it's at least as advanced, or if it has a higher perfNum (reset)
          if (remotePhase >= prevPhase || (remote.perfNum || 0) > (prev.perfNum || 0)) {
            saveTimeline(sheetId, showDate, remote)
            if (remote.reportFired) setReportFired(true)
            return remote
          }
          return prev
        })
        setLockedBy(lb || null)
      }
    }
    poll()
    timelinePollRef.current = setInterval(poll, TIMELINE_POLL_INTERVAL)
    return () => clearInterval(timelinePollRef.current)
  }, [sheetId, showDate])

  // Load check-in status
  useEffect(() => {
    api.getCheckinStatus(sheetId, showDate).then(setCheckinStatus).catch(() => {})
  }, [sheetId, showDate])

  // When show ends, start 30-min countdown for report
  useEffect(() => {
    if (timeline.phase === 'done' && timeline.act2End && !reportFired) {
      const endTime = new Date(timeline.act2End).getTime()
      const fireAt = endTime + REPORT_DELAY_MINUTES * 60 * 1000
      const msUntil = fireAt - Date.now()
      if (msUntil > 0) {
        setReportCountdown(msUntil)
        countdownRef.current = setInterval(() => {
          const remaining = fireAt - Date.now()
          if (remaining <= 0) { clearInterval(countdownRef.current); setReportCountdown(0); fireReport() }
          else setReportCountdown(remaining)
        }, 1000)
        reportTimerRef.current = setTimeout(() => fireReport(), msUntil)
      } else if (msUntil <= 0 && !reportFired) {
        setReportCountdown(0)
      }
    }
    return () => { clearTimeout(reportTimerRef.current); clearInterval(countdownRef.current) }
  }, [timeline.phase, timeline.act2End])

  async function updateTimeline(changes) {
    if (savingTimelineRef.current) return
    savingTimelineRef.current = true
    setSavingTimeline(true)
    try {
      const next = { ...timeline, ...changes }
      if (!next.lockedBy && (isSM || session?.staffRole === 'Asst. SM')) next.lockedBy = session.name
      setTimeline(next)
      setLockedBy(next.lockedBy || null)
      await saveTimelineRemote(sheetId, showDate, next)
    } finally {
      savingTimelineRef.current = false
      setSavingTimeline(false)
    }
  }

  async function applyManualEntry() {
    const mf = manualForm
    const act1Start = parseTimeToISO(mf.act1Start, showDate)
    const act1End = parseTimeToISO(mf.act1End, showDate)
    const intermissionStart = parseTimeToISO(mf.intermissionStart, showDate)
    const intermissionEnd = parseTimeToISO(mf.intermissionEnd, showDate)
    const act2Start = parseTimeToISO(mf.act2Start, showDate)
    const act2End = parseTimeToISO(mf.act2End, showDate)
    const phase = act2End ? 'done' : act2Start ? 'act2' : intermissionEnd ? 'act2' : intermissionStart ? 'intermission' : act1Start ? 'act1' : 'preshow'
    const next = { ...timeline, phase, act1Start, act1End: act1End || intermissionStart, intermissionStart, intermissionEnd: intermissionEnd || act2Start, act2Start, act2End }
    setTimeline(next)
    await saveTimelineRemote(sheetId, showDate, next)
    setManualEntry(false)
  }

  async function toggleHold() {
    if (timeline.holdStart) {
      // Resume — calculate how long we were on hold and add to totalHoldMs
      const holdDuration = Date.now() - new Date(timeline.holdStart).getTime()
      const totalHoldMs = (timeline.totalHoldMs || 0) + holdDuration
      await updateTimeline({ holdStart: null, totalHoldMs })
    } else {
      // Pause — record when we started the hold
      await updateTimeline({ holdStart: new Date().toISOString() })
    }
  }

  async function savePerformanceNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    try {
      const charNames = castNameList(characters)
      const parsed = parseHashtags(noteText, charNames, scenes)
      const noteData = {
        date: showDate,
        text: noteText,
        category: parsed.category || noteCategory,
        priority: parsed.priority || 'med',
        cast: parsed.cast || '',
        castList: parsed.cast ? parsed.cast.split(',').map(s => s.trim()).filter(Boolean) : [],
        scene: parsed.scene || '',
        createdBy: session.name || session.role,
        swTime: '',
      }
      const result = await api.saveNote(sheetId, noteData)
      const fullNote = { ...noteData, id: result.id, createdAt: result.createdAt, resolved: false }
      onNoteAdded(fullNote)
      setRecentNotes(prev => [fullNote, ...prev].slice(0, 10))
      setNoteText('')
    } catch (e) { console.warn('Note save failed:', e.message) }
    finally { setSavingNote(false) }
  }

  async function resetTimeline() {
    if (!confirm('Reset the show timeline for another performance? This clears all act timers.')) return
    const fresh = defaultTimeline()
    fresh.perfNum = (timeline.perfNum || 1) + 1
    setTimeline(fresh)
    setLockedBy(null)
    setReportFired(false)
    setReportResult(null)
    setReportCountdown(null)
    setClosingNote('')
    clearTimeout(reportTimerRef.current)
    clearInterval(countdownRef.current)
    await saveTimelineRemote(sheetId, showDate, fresh)
  }

  async function fireReport(extraNote = closingNote) {
    if (reportFired) return
    setReportFired(true)
    setReportSending(true)
    // Save to sheet so all devices know report was sent
    await saveTimelineRemote(sheetId, showDate, { ...timeline, reportFired: true })
    try {
      const result = await api.sendShowReport({ sheetId, showDate, timeline, closingNote: extraNote, productionCode })
      setReportResult(result)
    } catch (e) {
      console.warn('Report send failed:', e.message)
      setReportResult({ sent: false, message: 'Failed to send report: ' + e.message })
    }
    finally { setReportSending(false) }
  }

  const tonightNotes = notes.filter(n => n.date === showDate)
  const openNotes = notes.filter(n => !n.resolved && n.date !== showDate)
  const castList = (checkinStatus?.castList || []).map(c => typeof c === 'string' ? { name: c } : c)
  const checkedIn = new Set((checkinStatus?.checkins || []).map(c => c.castName))
  const missingCast = castList.filter(c => !checkedIn.has(c.name))

  const act1Ms = timeline.act1Start && timeline.act1End ? new Date(timeline.act1End) - new Date(timeline.act1Start) : 0
  const intermissionMs = timeline.intermissionStart && timeline.intermissionEnd ? new Date(timeline.intermissionEnd) - new Date(timeline.intermissionStart) : 0
  const act2Ms = timeline.act2Start && timeline.act2End ? new Date(timeline.act2End) - new Date(timeline.act2Start) : 0

  const phase = timeline.phase
  const isOnHold = !!timeline.holdStart

  // Current elapsed accounting for hold
  function currentElapsed() {
    const startKey = phase === 'act1' ? 'act1Start' : phase === 'intermission' ? 'intermissionStart' : 'act2Start'
    return fmtElapsedWithPause(timeline[startKey], timeline.holdStart, timeline.totalHoldMs || 0)
  }

  return (
    <div style={{ padding: '0 0 6rem' }}>

      {/* Manual entry modal */}
      {manualEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Enter show times manually</h2>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: '1rem' }}>Format: 7:32 PM, 19:32, 8:05 PM</p>
            {[
              { key: 'act1Start', label: 'Act 1 Start' },
              { key: 'act1End', label: 'Act 1 End / Intermission Start' },
              { key: 'intermissionStart', label: 'Intermission Start (if different)' },
              { key: 'intermissionEnd', label: 'Intermission End / Act 2 Start' },
              { key: 'act2Start', label: 'Act 2 Start (if different)' },
              { key: 'act2End', label: 'Act 2 End / Show End' },
            ].map(f => (
              <div key={f.key} className="field" style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12 }}>{f.label}</label>
                <input type="text" placeholder="e.g. 7:32 PM" value={manualForm[f.key]}
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

      {/* ── PRE-SHOW ── */}
      {phase === 'preshow' && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                🎭 Pre-show — {checkedIn.size} / {castList.length} checked in
                {missingCast.length > 0 && <span style={{ color: 'var(--red-text)', marginLeft: 8 }}>⚠ {missingCast.length} missing</span>}
              </p>
              {canEdit && <button className="btn btn-sm" onClick={() => setManualEntry(true)} style={{ fontSize: 11 }}>✏ Enter times</button>}
            </div>
            {missingCast.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--red-text)' }}>
                {missingCast.map(c => c.castMember || c.name).join(', ')}
              </div>
            )}
          </div>

          {openNotes.length > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>📌 Open notes from previous nights ({openNotes.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {openNotes.slice(0, 20).map(n => (
                  <div key={n.id} style={{ fontSize: 12, padding: '6px 8px', background: 'var(--bg2)', borderRadius: 'var(--radius)', borderLeft: '3px solid var(--border2)' }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                      <span className={`pdot pdot-${n.priority}`} style={{ marginTop: 2, flexShrink: 0 }} />
                      {n.cast && <span style={{ fontWeight: 500, color: 'var(--blue-text)' }}>{n.cast}</span>}
                      {n.scene && <span style={{ color: 'var(--text3)' }}>{n.scene}</span>}
                      <span style={{ color: 'var(--text3)', marginLeft: 'auto' }}>{n.date}</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text2)' }}>{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isController ? (
            <button onClick={() => updateTimeline({ phase: 'act1', act1Start: new Date().toISOString() })} disabled={savingTimeline}
              style={{ width: '100%', background: '#0f2340', border: 'none', borderRadius: 'var(--radius)', padding: '16px', fontSize: 16, fontWeight: 700, color: '#fff', cursor: 'pointer', marginBottom: 12 }}>
              ▶ Start Act 1
            </button>
          ) : (
            <div style={{ padding: '12px', textAlign: 'center', fontSize: 13, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 'var(--radius)', marginBottom: 12 }}>
              {lockedBy ? `🔒 Clock controlled by ${lockedBy}` : '👁 Waiting for SM to start clock'}
            </div>
          )}
        </>
      )}

      {/* ── ACT 1 / INTERMISSION / ACT 2 ── */}
      {(phase === 'act1' || phase === 'intermission' || phase === 'act2') && (
        <>
          <div style={{
            background: isOnHold ? '#7c2d12' : phase === 'intermission' ? '#1e1b4b' : phase === 'act2' ? '#14532d' : '#0f2340',
            borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 12,
            transition: 'background 0.3s'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: isOnHold ? '#fca5a5' : 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
                {isOnHold ? '⏸ HOLD' : phase === 'act1' ? 'Now Playing — Act One' : phase === 'intermission' ? 'Intermission' : 'Now Playing — Act Two'}
              </p>
              {canEdit && <button className="btn btn-sm" onClick={() => setManualEntry(true)} style={{ fontSize: 10, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderColor: 'transparent' }}>✏ Edit times</button>}
            </div>

            <div style={{ fontSize: 48, fontWeight: 900, color: isOnHold ? '#fca5a5' : '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 12 }}>
              {currentElapsed()}
            </div>

            {isOnHold && (
              <p style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8, textAlign: 'center' }}>
                Hold started at {fmtTime(timeline.holdStart)} · Resume when ready
              </p>
            )}

            {isController && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {/* Hold/Resume button */}
                <button onClick={toggleHold} disabled={savingTimeline}
                  style={{ flex: 1, background: isOnHold ? '#f97316' : 'rgba(255,255,255,0.15)', border: isOnHold ? 'none' : '1.5px solid rgba(255,255,255,0.3)', borderRadius: 'var(--radius)', padding: '10px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                  {isOnHold ? '▶ Resume' : '⏸ Hold'}
                </button>
                {/* Next phase button */}
                {!isOnHold && (
                  <button onClick={() => {
                    const n = new Date().toISOString()
                    if (phase === 'act1') updateTimeline({ phase: 'intermission', act1End: n, intermissionStart: n, holdStart: null, totalHoldMs: 0 })
                    else if (phase === 'intermission') updateTimeline({ phase: 'act2', intermissionEnd: n, act2Start: n, holdStart: null, totalHoldMs: 0 })
                    else updateTimeline({ phase: 'done', act2End: n, showEnd: n, holdStart: null, totalHoldMs: 0 })
                  }} disabled={savingTimeline} style={{ flex: 2, background: phase === 'act1' ? '#fbbf24' : phase === 'intermission' ? '#059669' : 'rgba(255,255,255,0.15)', border: phase === 'act2' ? '1.5px solid rgba(255,255,255,0.3)' : 'none', borderRadius: 'var(--radius)', padding: '10px', fontSize: 14, fontWeight: 700, color: phase === 'act1' ? '#0f0f0f' : '#fff', cursor: savingTimeline ? 'not-allowed' : 'pointer', opacity: savingTimeline ? 0.6 : 1 }}>
                    {savingTimeline ? '…' : phase === 'act1' ? '⏸ Start Intermission' : phase === 'intermission' ? '▶ Call Act 2' : '🎉 End Show'}
                  </button>
                )}
              </div>
            )}

            {!isController && (
              <div style={{ padding: '10px', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.4)', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 'var(--radius)' }}>
                🔒 Controlled by {lockedBy || 'SM'}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="card">
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                📋 Open notes ({openNotes.length})
              </p>
              {openNotes.length === 0
                ? <p style={{ fontSize: 12, color: 'var(--text3)' }}>No open notes</p>
                : <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {openNotes.slice(0, 15).map(n => (
                      <div key={n.id} style={{ fontSize: 11, padding: '5px 7px', background: 'var(--bg2)', borderRadius: 'var(--radius)', borderLeft: `3px solid ${n.priority === 'high' ? 'var(--red-text)' : 'var(--border2)'}` }}>
                        {n.cast && <span style={{ fontWeight: 500, color: 'var(--blue-text)', marginRight: 4 }}>{n.cast}</span>}
                        <span style={{ color: 'var(--text2)' }}>{n.text}</span>
                      </div>
                    ))}
                  </div>
              }
            </div>

            <div className="card">
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                ✏️ Log note
              </p>
              <textarea rows={4} value={noteText} onChange={e => setNoteText(e.target.value)}
                placeholder="Type note… #lights @cast #blocking"
                style={{ fontSize: 13, resize: 'none', marginBottom: 6, width: '100%', boxSizing: 'border-box' }} />
              <select value={noteCategory} onChange={e => setNoteCategory(e.target.value)}
                style={{ fontSize: 12, marginBottom: 8, width: '100%' }}>
                {['general','blocking','performance','music','technical','costume','set'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={savePerformanceNote} disabled={savingNote || !noteText.trim()} style={{ width: '100%' }}>
                {savingNote ? 'Saving…' : '+ Save note'}
              </button>
              {recentNotes.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '0.5px solid var(--border)', paddingTop: 6 }}>
                  <p style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>JUST LOGGED</p>
                  {recentNotes.slice(0, 3).map(n => (
                    <div key={n.id} style={{ fontSize: 11, color: 'var(--text3)', padding: '3px 0', borderBottom: '0.5px solid var(--border)' }}>{n.text}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── DONE ── */}
      {phase === 'done' && (
        <>
          <div style={{ background: '#0f2340', borderRadius: 'var(--radius-lg)', padding: '18px 20px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ textAlign: 'center', flex: 1 }}>
                <p style={{ fontSize: 22, margin: 0 }}>🎉</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '4px 0 2px' }}>Show complete!</p>
                {timeline.perfNum && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Performance {timeline.perfNum}</p>}
              </div>
              {canEdit && <button className="btn btn-sm" onClick={() => setManualEntry(true)} style={{ fontSize: 10, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderColor: 'transparent' }}>✏ Edit times</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[
                { label: 'Act 1', ms: act1Ms, start: timeline.act1Start, end: timeline.act1End },
                { label: 'Intermission', ms: intermissionMs, start: timeline.intermissionStart, end: timeline.intermissionEnd, warn: intermissionMs > 15*60*1000 },
                { label: 'Act 2', ms: act2Ms, start: timeline.act2Start, end: timeline.act2End },
              ].map(({ label, ms, start, end, warn }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
                  <p style={{ fontSize: 20, fontWeight: 800, color: warn ? '#fca5a5' : '#fff', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtMs(ms)}</p>
                  {start && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0' }}>{fmtTime(start)} → {fmtTime(end)}</p>}
                </div>
              ))}
            </div>
            <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.12)', paddingTop: 12, textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total running time</p>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#fff', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtMs(act1Ms + intermissionMs + act2Ms)}</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            {!reportFired ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                  📧 Show report sends in {reportCountdown !== null ? fmtMs(reportCountdown) : `${REPORT_DELAY_MINUTES}:00`}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                  Enter any closing notes before the report fires. It will be emailed to the SM and Director.
                </p>
                <textarea rows={3} value={closingNote} onChange={e => setClosingNote(e.target.value)}
                  placeholder="Post-show notes… (optional)"
                  style={{ fontSize: 13, resize: 'none', marginBottom: 8, width: '100%', boxSizing: 'border-box' }} />
                <button className="btn btn-primary btn-sm" onClick={() => fireReport(closingNote)} disabled={reportSending}>
                  {reportSending ? 'Sending…' : '📧 Send report now'}
                </button>
              </>
            ) : reportSending || !reportResult ? (
              <p style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>📧 Sending report...</p>
            ) : reportResult.sent === false ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--yellow-text)', fontWeight: 500, marginBottom: 8 }}>
                  ⚠️ {reportResult.message || 'Report not sent'}
                </p>
                {reportResult.reportPreview && (
                  <details style={{ fontSize: 12, color: 'var(--text2)' }}>
                    <summary style={{ cursor: 'pointer', marginBottom: 8, color: 'var(--text3)' }}>View report content</summary>
                    <pre style={{
                      background: 'var(--bg2)',
                      padding: '12px',
                      borderRadius: 'var(--radius)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: 11,
                      lineHeight: 1.5,
                      maxHeight: 300,
                      overflowY: 'auto',
                      margin: 0
                    }}>{reportResult.reportPreview}</pre>
                  </details>
                )}
              </>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--green-text)', fontWeight: 500 }}>✅ Show report sent to SM and Director!</p>
            )}
          </div>

          {/* Reset for next performance */}
          {isController && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
                    {timeline.perfNum ? `Performance ${timeline.perfNum} complete` : 'Performance complete'}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text3)', margin: '2px 0 0' }}>
                    Reset to start another show today
                  </p>
                </div>
                <button className="btn" onClick={resetTimeline} style={{ whiteSpace: 'nowrap' }}>
                  Reset for next show
                </button>
              </div>
            </div>
          )}

          {tonightNotes.length > 0 && (
            <div className="card">
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Tonight's notes ({tonightNotes.length})</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tonightNotes.map(n => (
                  <div key={n.id} style={{ fontSize: 12, padding: '6px 8px', background: 'var(--bg2)', borderRadius: 'var(--radius)', borderLeft: `3px solid ${n.resolved ? 'var(--border)' : 'var(--blue-text)'}`, opacity: n.resolved ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                      <span className={`pdot pdot-${n.priority}`} style={{ marginTop: 2 }} />
                      {n.cast && <span style={{ fontWeight: 500, color: 'var(--blue-text)' }}>{n.cast}</span>}
                      <span className={`badge badge-${n.category}`} style={{ fontSize: 10 }}>{n.category}</span>
                      {n.resolved && <span style={{ fontSize: 10, color: 'var(--green-text)', marginLeft: 'auto' }}>✓ resolved</span>}
                    </div>
                    <p style={{ margin: 0, color: 'var(--text2)', textDecoration: n.resolved ? 'line-through' : 'none' }}>{n.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
