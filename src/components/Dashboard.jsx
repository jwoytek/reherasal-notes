import { useMemo } from 'react'
import { detectScenesFromEvent, eventToDate } from '../lib/sceneDetect'

function StatCard({ n, label, color, attention }) {
  return (
    <div className={`stat${attention ? ' stat--attention' : ''}`} style={color ? { borderLeft: `3px solid ${color}` } : {}}>
      <div className="stat-n" style={color ? { color } : {}}>{n}</div>
      <div className="stat-l">{label}</div>
    </div>
  )
}

export default function Dashboard({
  notes, production, session, calendarEvents,
  onNavigate, onLogForDate, openNotes
}) {
  const config = production?.config || {}
  const title = session?.title || config.title || 'Production'

  // Show countdown
  const daysToShow = useMemo(() => {
    if (!config.showDates) return null
    const match = config.showDates.match(/(\w+\s+\d+),?\s*(\d{4})?/)
    if (!match) return null
    try {
      const year = match[2] || new Date().getFullYear()
      const showDate = new Date(match[1] + ' ' + year)
      if (isNaN(showDate)) return null
      const today = new Date(); today.setHours(0,0,0,0); showDate.setHours(0,0,0,0)
      const diff = Math.round((showDate - today) / 86400000)
      return diff >= 0 && diff <= 365 ? diff : null
    } catch { return null }
  }, [config.showDates])

  // Next rehearsal from calendar
  const nextEvent = calendarEvents?.[0] || null

  // Note stats
  const totalNotes = notes.length
  const openCount = notes.filter(n => !n.resolved).length
  const highCount = notes.filter(n => n.priority === 'high' && !n.resolved).length
  const SM_ROLES = ['Stage Manager', 'Asst. SM', 'Assistant SM']
  const myPinned = notes.filter(n => n.pinned && !n.resolved && (
    !n.pinnedBy ||
    SM_ROLES.includes(session?.staffRole) ||
    session?.role === 'admin' || session?.role === 'member' ||
    n.pinnedBy === session?.staffRole ||
    n.pinnedBy === session?.name
  ))
  const pinnedCount = myPinned.length
  const privateCount = notes.filter(n => n.privateNote).length

  // Last rehearsal date
  const dates = [...new Set(notes.map(n => n.date))].sort().reverse()
  const lastDate = dates[0]
  const lastRehearsalNotes = lastDate ? notes.filter(n => n.date === lastDate) : []
  const lastOpen = lastRehearsalNotes.filter(n => !n.resolved).length

  const countdownColor = daysToShow === 0 ? '#e24b4a' : daysToShow <= 3 ? '#e24b4a' : daysToShow <= 7 ? '#ef9f27' : undefined

  return (
    <div>
      {/* Hero countdown */}
      {daysToShow !== null && (
        <div style={{
          background: daysToShow <= 3 ? 'var(--red-bg)' : daysToShow <= 7 ? 'var(--amber-bg)' : 'var(--bg2)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem 1.5rem',
          marginBottom: '1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <p style={{ fontSize: 13, color: daysToShow <= 7 ? countdownColor : 'var(--text2)', fontWeight: 500, marginBottom: 2 }}>
              {daysToShow === 0 ? '🎭 Opening night!' : daysToShow === 1 ? '🎭 Opens tomorrow!' : `🎭 ${daysToShow} days to opening`}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>{config.showDates}</p>
          </div>
          {config.venue && (
            <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'right' }}>{config.venue}</p>
          )}
        </div>
      )}

      {/* Next rehearsal */}
      {nextEvent && (
        <div className="card" style={{ marginBottom: '1rem', cursor: 'pointer' }}
          onClick={() => onNavigate(3)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>Next rehearsal</p>
              <p style={{ fontSize: 15, fontWeight: 600 }}>{nextEvent.title}</p>
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                {new Date(nextEvent.start).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                {!nextEvent.allDay && ' · ' + new Date(nextEvent.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {nextEvent.location && ' · ' + nextEvent.location}
              </p>
            </div>
            <button className="btn btn-sm btn-primary"
              onClick={e => { e.stopPropagation(); onLogForDate(eventToDate(nextEvent), null) }}>
              Log notes →
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats-bar" style={{ marginBottom: '1rem' }}>
        <StatCard n={openCount} label="open notes" attention={openCount > 0} />
        <StatCard n={highCount} label="high priority" color={highCount > 0 ? '#e24b4a' : undefined} />
        <StatCard n={pinnedCount} label="pinned" color={pinnedCount > 0 ? '#a78bfa' : undefined} />
        <StatCard n={totalNotes} label="total notes" />
      </div>

      {/* Pinned notes */}
      {pinnedCount > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>📌 Pinned notes</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myPinned.map(n => (
              <div key={n.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '0.5px solid var(--border)', display: 'flex', gap: 8 }}>
                <span className={`pdot pdot-${n.priority}`} style={{ marginTop: 4, flexShrink: 0 }} />
                <div>
                  {n.cast && <span style={{ fontWeight: 500, marginRight: 6 }}>{n.cast}</span>}
                  {n.scene && <span className="badge badge-scene" style={{ marginRight: 6 }}>{n.scene}</span>}
                  <span>{n.text}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last rehearsal summary */}
      {lastDate && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 500 }}>
              Last rehearsal — {new Date(lastDate + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
            <button className="btn btn-sm" onClick={() => onNavigate(1)}>View all →</button>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--text2)' }}>
            <span>{lastRehearsalNotes.length} notes logged</span>
            <span style={{ color: lastOpen > 0 ? 'var(--red-text)' : 'var(--green-text)', fontWeight: 500 }}>
              {lastOpen} open
            </span>
            <span>{lastRehearsalNotes.filter(n => n.resolved).length} resolved</span>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="quicknav-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button className="btn" onClick={() => onNavigate(1)}
          style={{ height: 88, flexDirection: 'column', gap: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="qn-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v12H5.2L4 17.2z"/><path d="M8 9h8M8 12h5"/></svg>
          </span>
          <span style={{ fontSize: 13 }}>Review notes</span>
        </button>
        <button className="btn" onClick={() => onNavigate(2)}
          style={{ height: 88, flexDirection: 'column', gap: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="qn-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0114 0"/></svg>
          </span>
          <span style={{ fontSize: 13 }}>By cast member</span>
        </button>
        <button className="btn" onClick={() => onNavigate(5)}
          style={{ height: 88, flexDirection: 'column', gap: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="qn-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"/></svg>
          </span>
          <span style={{ fontSize: 13 }}>Trends</span>
        </button>
        <button className="btn" onClick={() => onNavigate(3)}
          style={{ height: 88, flexDirection: 'column', gap: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="qn-ring">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>
          </span>
          <span style={{ fontSize: 13 }}>Calendar</span>
        </button>
      </div>
    </div>
  )
}
