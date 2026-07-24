import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { getTimeline, saveTimeline, fmtElapsed, elapsedMs } from '../lib/showTimeline'

const INTERMISSION_STANDARD = 15 * 60 * 1000

export default function IntermissionDashboard({ sheetId, productionCode, production, session, notes, onLogNote }) {
  const showDate = new Date().toISOString().slice(0, 10)
  const [timeline, setTimeline] = useState(() => getTimeline(sheetId, showDate))
  const [now, setNow] = useState(new Date())
  const [checkinStatus, setCheckinStatus] = useState(null)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Sync timeline every 2s in case ShowDayTab updated it
  useEffect(() => {
    const t = setInterval(() => {
      setTimeline(getTimeline(sheetId, showDate))
      setNow(new Date())
    }, 1000)
    return () => clearInterval(t)
  }, [sheetId, showDate])

  useEffect(() => {
    api.getCheckinStatus(sheetId, showDate).then(d => setCheckinStatus(d)).catch(() => {})
  }, [sheetId, showDate])

  const castList = (checkinStatus?.castList || []).map(c => typeof c === 'string' ? c : c.name).filter(Boolean)
  const checkins = checkinStatus?.checkins || []
  const checkedIn = new Set(checkins.map(c => c.castName))
  const missing = castList.filter(n => !checkedIn.has(n))
  const openNotes = (notes || []).filter(n => n.date === showDate && n.status === 'open')

  const intermissionMs = elapsedMs(timeline.intermissionStart, timeline.intermissionEnd)
  const intermissionOver = timeline.phase === 'intermission' && intermissionMs > INTERMISSION_STANDARD

  async function quickLog() {
    if (!newNote.trim()) return
    setSavingNote(true)
    try {
      await api.saveNote(sheetId, {
        text: newNote, date: showDate, category: 'performance',
        priority: 'med', status: 'open',
        createdBy: session?.name || 'Director',
        scene: `Performance ${timeline.perfNum} · Act 2`,
      })
      setNewNote('')
      if (onLogNote) onLogNote()
    } catch (e) { alert('Failed: ' + e.message) }
    finally { setSavingNote(false) }
  }

  // Not in intermission or act2 — show redirect hint
  if (timeline.phase === 'preshow' || timeline.phase === 'act1') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>⏸</p>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Intermission hasn't started yet</p>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>
          Go to Show Day tab and tap "Start Intermission" when Act 1 ends.
        </p>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
          Current phase: <strong>{timeline.phase === 'preshow' ? 'Pre-show' : 'Act 1 running'}</strong>
        </p>
      </div>
    )
  }

  if (timeline.phase === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>🎉</p>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Show complete!</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        background: intermissionOver ? 'var(--red-bg)' : 'var(--purple-bg)',
        border: intermissionOver ? '1.5px solid var(--red-text)' : 'none',
        borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: '1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'background 0.5s',
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: intermissionOver ? 'var(--red-text)' : 'var(--text)', margin: 0 }}>
            {timeline.phase === 'act2' ? '🎭 Act 2 Running' : intermissionOver ? '⏰ Intermission Over Time' : '⏸ Intermission'}
          </p>
          <p style={{ fontSize: 11, color: intermissionOver ? 'var(--red-text)' : 'var(--text2)', margin: 0 }}>
            {production?.config?.title} · Performance {timeline.perfNum}
          </p>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>

      {/* Intermission phase detail */}
      {timeline.phase === 'intermission' && (
        <div style={{
          background: intermissionOver ? 'var(--red-bg)' : 'var(--bg2)',
          border: `1.5px solid ${intermissionOver ? 'var(--red-text)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '1rem', textAlign: 'center',
        }}>
          {intermissionOver ? (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--red-text)', marginBottom: 4 }}>OVER TIME</p>
              <div style={{ fontSize: 52, fontWeight: 900, color: 'var(--red-text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                +{fmtElapsed(new Date(timeline.intermissionStart).getTime() + INTERMISSION_STANDARD, timeline.intermissionEnd)}
              </div>
              <p style={{ fontSize: 12, color: 'var(--red-text)', marginTop: 6 }}>over standard 15 minutes</p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 4 }}>Elapsed</p>
              <div style={{ fontSize: 52, fontWeight: 900, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {fmtElapsed(timeline.intermissionStart, timeline.intermissionEnd)}
              </div>
              <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, margin: '10px 0 4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, (intermissionMs / INTERMISSION_STANDARD) * 100)}%`, background: intermissionMs > INTERMISSION_STANDARD * 0.8 ? 'var(--amber-text)' : 'var(--blue-text)', transition: 'width 1s linear' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)' }}>of standard 15:00 · Use Show Day tab to call Act 2</p>
            </>
          )}
        </div>
      )}

      {/* Act 2 timer */}
      {timeline.phase === 'act2' && (
        <div className="card" style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Act 2 elapsed</p>
          <div style={{ fontSize: 44, fontWeight: 900, color: 'var(--green-text)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtElapsed(timeline.act2Start, timeline.act2End)}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
            Intermission ran {fmtElapsed(timeline.intermissionStart, timeline.intermissionEnd)} ·
            Called {new Date(timeline.act2Start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      )}

      {/* Cast + notes */}
      <div className="grid2" style={{ gap: 12, marginBottom: '1rem' }}>
        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>Cast</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, background: 'var(--green-bg)', borderRadius: 'var(--radius)', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--green-text)' }}>{checkedIn.size}</div>
              <div style={{ fontSize: 10, color: 'var(--green-text)' }}>in</div>
            </div>
            <div style={{ flex: 1, background: missing.length > 0 ? 'var(--red-bg)' : 'var(--bg2)', borderRadius: 'var(--radius)', padding: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: missing.length > 0 ? 'var(--red-text)' : 'var(--text3)' }}>{missing.length}</div>
              <div style={{ fontSize: 10, color: missing.length > 0 ? 'var(--red-text)' : 'var(--text3)' }}>missing</div>
            </div>
          </div>
        </div>
        <div className="card">
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
            Open notes {openNotes.length > 0 && <span style={{ background: 'var(--red-bg)', color: 'var(--red-text)', fontSize: 10, padding: '1px 6px', borderRadius: 10, marginLeft: 4 }}>{openNotes.length}</span>}
          </p>
          {openNotes.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--text3)' }}>None</p>
            : openNotes.slice(0, 3).map((n, i) => (
                <div key={i} style={{ fontSize: 11, color: n.priority === 'high' ? 'var(--red-text)' : 'var(--text)', padding: '3px 0', borderBottom: '0.5px solid var(--border)' }}>
                  {n.priority === 'high' ? '⚡ ' : ''}{n.text?.slice(0, 48)}{n.text?.length > 48 ? '…' : ''}
                </div>
              ))
          }
        </div>
      </div>

      {/* Quick note */}
      <div className="card">
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 8 }}>
          Quick note — Performance {timeline.perfNum} · {timeline.phase === 'act2' ? 'Act 2' : 'Intermission'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && quickLog()}
            placeholder="Log a note…" style={{ flex: 1, fontSize: 13 }} />
          <button className="btn btn-primary" onClick={quickLog} disabled={savingNote || !newNote.trim()}>
            {savingNote ? '…' : 'Log'}
          </button>
        </div>
      </div>
    </div>
  )
}
