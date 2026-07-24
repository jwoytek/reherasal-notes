import { useMemo } from 'react'

function Bar({ value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ height: 8, background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  )
}

const CAT_COLORS = {
  blocking: '#f6d67e', performance: '#a78bfa', music: '#9fe1cb',
  technical: '#f0997b', general: '#8fe0a6', costume: '#ed93b1', set: '#85b7eb'
}

export default function TrendsTab({ notes }) {
  const stats = useMemo(() => {
    if (!notes.length) return null

    // Notes per rehearsal date
    const byDate = {}
    notes.forEach(n => {
      if (!byDate[n.date]) byDate[n.date] = { total: 0, resolved: 0 }
      byDate[n.date].total++
      if (n.resolved) byDate[n.date].resolved++
    })

    // Notes per cast member (top 8)
    const byCast = {}
    notes.filter(n => n.cast).forEach(n => {
      if (!byCast[n.cast]) byCast[n.cast] = { total: 0, open: 0, high: 0 }
      byCast[n.cast].total++
      if (!n.resolved) byCast[n.cast].open++
      if (n.priority === 'high' && !n.resolved) byCast[n.cast].high++
    })

    // Notes by category
    const byCat = {}
    notes.forEach(n => {
      byCat[n.category] = (byCat[n.category] || 0) + 1
    })

    // Carried over count
    const carriedOver = notes.filter(n => n.carriedOver === 'true').length

    // High priority unresolved
    const highOpen = notes.filter(n => n.priority === 'high' && !n.resolved).length

    // Resolution rate
    const resRate = notes.length > 0 ? Math.round((notes.filter(n => n.resolved).length / notes.length) * 100) : 0

    // Dates sorted
    const dates = Object.keys(byDate).sort()

    // Top cast members by total notes
    const topCast = Object.entries(byCast)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8)

    const maxCast = topCast.length > 0 ? topCast[0][1].total : 1

    return { byDate, byCat, dates, topCast, maxCast, carriedOver, highOpen, resRate }
  }, [notes])

  if (!notes.length) return <div className="empty">No notes yet — start logging from the Log tab and trends will appear here.</div>
  if (!stats) return null

  return (
    <div>
      {/* Summary stats */}
      <div className="stats-bar" style={{ marginBottom: '1.5rem' }}>
        <div className="stat"><div className="stat-n">{notes.length}</div><div className="stat-l">total notes</div></div>
        <div className="stat"><div className="stat-n">{stats.resRate}%</div><div className="stat-l">resolved</div></div>
        <div className="stat"><div className="stat-n" style={{ color: stats.highOpen > 0 ? 'var(--red-text)' : undefined }}>{stats.highOpen}</div><div className="stat-l">high priority open</div></div>
        <div className="stat"><div className="stat-n">{stats.carriedOver}</div><div className="stat-l">carried over</div></div>
      </div>

      {/* Notes per rehearsal */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="section-label" style={{ marginBottom: '1rem' }}>Notes per rehearsal</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stats.dates.map(date => {
            const d = stats.byDate[date]
            const dt = new Date(date + 'T00:00:00')
            const label = dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
            const maxTotal = Math.max(...Object.values(stats.byDate).map(x => x.total))
            return (
              <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 90 }}>{label}</span>
                <Bar value={d.total} max={maxTotal} color="var(--text)" />
                <span style={{ fontSize: 12, fontWeight: 500, minWidth: 24, textAlign: 'right' }}>{d.total}</span>
                <span style={{ fontSize: 11, color: 'var(--green-text)', minWidth: 50 }}>{d.resolved} resolved</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Notes by category */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p className="section-label" style={{ marginBottom: '1rem' }}>By category</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(stats.byCat).sort((a,b) => b[1]-a[1]).map(([cat, count]) => {
            const maxCat = Math.max(...Object.values(stats.byCat))
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 90, textTransform: 'capitalize' }}>{cat}</span>
                <Bar value={count} max={maxCat} color={CAT_COLORS[cat] || 'var(--text3)'} />
                <span style={{ fontSize: 12, fontWeight: 500, minWidth: 24, textAlign: 'right' }}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top cast members */}
      {stats.topCast.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <p className="section-label" style={{ marginBottom: '1rem' }}>Notes by cast member</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.topCast.map(([name, data]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <Bar value={data.total} max={stats.maxCast} color="var(--purple-text)" />
                <span style={{ fontSize: 12, fontWeight: 500, minWidth: 24, textAlign: 'right' }}>{data.total}</span>
                {data.open > 0 && (
                  <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: data.high > 0 ? 'var(--red-bg)' : 'var(--amber-bg)', color: data.high > 0 ? 'var(--red-text)' : 'var(--amber-text)', whiteSpace: 'nowrap' }}>
                    {data.open} open{data.high > 0 ? ` · ${data.high} ★` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
