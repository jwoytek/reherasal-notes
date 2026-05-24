import { useState } from 'react'
import { api } from '../lib/api'

export default function ReportTab({ notes, production, sheetId, session }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [emails, setEmails] = useState(() => {
    try { return localStorage.getItem('rn_report_emails_' + sheetId) || '' } catch { return '' }
  })
  // Use logged-in user's name/email, fall back to production config
  const senderName = session?.name || production?.config?.directorName || ''
  const senderEmail = session?.email || production?.config?.directorEmail || ''

  const [selectedDate, setSelectedDate] = useState(() => {
    const dates = [...new Set(notes.map(n => n.date))].sort().reverse()
    return dates[0] || new Date().toISOString().slice(0, 10)
  })
  const [includeResolved, setIncludeResolved] = useState(false)

  const rehearsalDates = [...new Set(notes.map(n => n.date))].sort().reverse()
  const filteredNotes = notes.filter(n => n.date === selectedDate && !n.privateNote && (includeResolved || !n.resolved))

  function saveEmails(val) {
    setEmails(val)
    localStorage.setItem('rn_report_emails_' + sheetId, val)
  }

  async function send() {
    if (!emails.trim()) { setError('Enter at least one email address'); return }
    if (!filteredNotes.length) { setError('No notes for this date to send'); return }
    setSending(true)
    setError('')
    try {
      const to = emails.split(',').map(e => e.trim()).filter(Boolean)
      const dt = new Date(selectedDate + 'T00:00:00')
      const dateLabel = dt.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
      await fetch('/api/sendReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject: `Rehearsal report — ${production?.config?.title || 'Production'} — ${dateLabel}`,
          notes: filteredNotes,
          productionTitle: production?.config?.title || 'Production',
          date: selectedDate,
          directorName: senderName,
          directorEmail: senderEmail
        })
      }).then(r => r.json()).then(d => {
        if (d.error) throw new Error(d.error)
      })
      setSent(true)
      setTimeout(() => setSent(false), 3000)
    } catch (e) {
      setError('Failed to send: ' + e.message)
    } finally {
      setSending(false)
    }
  }

  function exportReport() {
    if (!filteredNotes.length) return
    const dt = new Date(selectedDate + 'T00:00:00')
    const dateLabel = dt.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    const byScene = {}
    filteredNotes.forEach(n => {
      const k = n.scene || 'General'
      if (!byScene[k]) byScene[k] = []
      byScene[k].push(n)
    })
    const lines = [
      `${production?.config?.title || 'Production'}`,
      `Rehearsal Report — ${dateLabel}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `Total notes: ${filteredNotes.length}`,
      `Open: ${filteredNotes.filter(n => !n.resolved).length}`,
      `Resolved: ${filteredNotes.filter(n => n.resolved).length}`,
      ''
    ]
    Object.entries(byScene).forEach(([scene, ns]) => {
      lines.push(`== ${scene.toUpperCase()} ==`)
      ns.forEach(n => {
        const who = n.cast ? ` [${n.cast}]` : ''
        const cue = n.cue ? ` (@ ${n.cue})` : ''
        const pri = n.priority === 'high' ? ' ★' : ''
        const res = n.resolved ? ' [RESOLVED]' : ''
        lines.push(`• [${n.category}]${who}${cue}${pri}${res} — ${n.text}`)
      })
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rehearsal-report-${selectedDate}.txt`
    a.click()
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p style={{ fontSize: 14, fontWeight: 500, marginBottom: '1rem' }}>Rehearsal report</p>

        <div className="grid2" style={{ marginBottom: '1rem' }}>
          <div className="field">
            <label>Rehearsal date</label>
            <select value={selectedDate} onChange={e => setSelectedDate(e.target.value)}>
              {rehearsalDates.map(d => {
                const dt = new Date(d + 'T00:00:00')
                return <option key={d} value={d}>{dt.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</option>
              })}
              {!rehearsalDates.length && <option value={selectedDate}>Today</option>}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 0 }}>
              <input type="checkbox" checked={includeResolved} onChange={e => setIncludeResolved(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Include resolved notes</span>
            </label>
          </div>
        </div>

        <div style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: 'var(--radius)', marginBottom: '1rem', fontSize: 13, color: 'var(--text2)' }}>
          {filteredNotes.length} notes · {filteredNotes.filter(n => !n.resolved).length} open · {filteredNotes.filter(n => n.resolved).length} resolved
        </div>

        <div style={{ height: '0.5px', background: 'var(--border)', margin: '1rem 0' }} />

        <div className="field" style={{ marginBottom: '1rem' }}>
          <label>Send to (comma-separated emails)</label>
          <input type="text" value={emails} onChange={e => saveEmails(e.target.value)}
            placeholder="stage.manager@school.edu, music.director@school.edu" />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red-text)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={send} disabled={sending || !filteredNotes.length}>
            {sending ? 'Sending…' : sent ? '✓ Sent!' : 'Send report email'}
          </button>
          <button className="btn" onClick={exportReport} disabled={!filteredNotes.length}>
            Export as text
          </button>
        </div>

      </div>

      {/* Preview */}
      {filteredNotes.length > 0 && (
        <div className="card">
          <p className="section-label" style={{ marginBottom: '1rem' }}>Preview</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredNotes.map(n => (
              <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: '0.5px solid var(--border)', opacity: n.resolved ? 0.5 : 1 }}>
                <span className={`pdot pdot-${n.priority}`} style={{ marginTop: 4, flexShrink: 0 }} />
                <div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                    {n.scene && <span className="badge badge-scene">{n.scene}</span>}
                    <span className={`badge badge-${n.category}`}>{n.category}</span>
                    {n.cast && <span className="badge badge-char">{n.cast}</span>}
                    {n.resolved && <span style={{ fontSize: 11, color: 'var(--green-text)' }}>✓ resolved</span>}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>{n.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
