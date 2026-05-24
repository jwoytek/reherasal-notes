'use strict'

const { sheetsClient, getRows, CORS, ok, err } = require('./_sheets')
const https = require('https')

function resendEmail({ to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      from: 'Ovature <noreply@notes.vhsdrama.org>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text
    })
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (res.statusCode >= 400) reject(new Error(parsed.message || 'Email error'))
          else resolve(parsed)
        } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

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
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405)

  let body
  try { body = JSON.parse(event.body) } catch { return err('Invalid JSON') }

  const { sheetId, showDate, timeline, closingNote, productionCode } = body
  if (!sheetId || !showDate) return err('sheetId and showDate required')

  try {
    const sheets = await sheetsClient()

    // Get config
    const configRows = await getRows(sheets, sheetId, 'Config!A:B')
    const config = {}
    configRows.forEach(([k, v]) => { if (k) config[k] = v })

    const productionTitle = config.title || 'Production'
    const directorEmail = config.directorEmail || ''
    const directorName = config.directorName || 'Director'

    // Get SM email from SharedWith
    let smEmail = ''
    let smName = 'Stage Manager'
    try {
      const swRows = await getRows(sheets, sheetId, 'SharedWith!A:I')
      if (swRows.length > 1) {
        const [header, ...data] = swRows
        const idx = {}; header.forEach((c, i) => { idx[c] = i })
        const sm = data.find(r => (r[idx.staffRole] || '').toLowerCase().includes('stage manager'))
        if (sm) { smEmail = sm[idx.email] || ''; smName = sm[idx.name] || 'Stage Manager' }
      }
    } catch (e) { console.warn('Could not read SharedWith:', e.message) }

    // Get tonight's notes
    let tonightNotes = []
    let openNotes = []
    try {
      const notesRows = await getRows(sheets, sheetId, 'Notes!A:S')
      if (notesRows.length > 1) {
        const [header, ...data] = notesRows
        const idx = {}; header.forEach((c, i) => { idx[c] = i })
        const allNotes = data.filter(r => r[idx.deleted] !== 'true' && r.some(Boolean))
        tonightNotes = allNotes
          .filter(r => (r[idx.date] || '') === showDate)
          .map(r => ({
            text: r[idx.text] || '',
            category: r[idx.category] || '',
            cast: r[idx.cast] || '',
            priority: r[idx.priority] || 'med',
            resolved: r[idx.resolved] === 'true',
            scene: r[idx.scene] || '',
          }))
        openNotes = allNotes
          .filter(r => r[idx.resolved] !== 'true' && (r[idx.date] || '') !== showDate)
          .map(r => ({
            text: r[idx.text] || '',
            category: r[idx.category] || '',
            cast: r[idx.cast] || '',
            priority: r[idx.priority] || 'med',
            date: r[idx.date] || '',
            scene: r[idx.scene] || '',
          }))
      }
    } catch (e) { console.warn('Could not read notes:', e.message) }

    // Get attendance
    let checkedIn = []
    let missingCast = []
    try {
      const checkinRows = await getRows(sheets, sheetId, 'Checkins!A:G')
      if (checkinRows.length > 1) {
        const [header, ...data] = checkinRows
        const idx = {}; header.forEach((c, i) => { idx[c] = i })
        checkedIn = data
          .filter(r => r[idx.showDate] === showDate && r.some(Boolean))
          .map(r => r[idx.castName])
      }
      // Get full cast list for missing
      let characters = []
      try { characters = JSON.parse(config.characters || '[]') } catch {}
      const allCast = []
      for (const c of characters) {
        if (typeof c === 'string') allCast.push(c)
        else if (c.isGroup && Array.isArray(c.members)) allCast.push(...c.members)
        else allCast.push(c.name)
      }
      const checkedInSet = new Set(checkedIn)
      missingCast = allCast.filter(n => !checkedInSet.has(n))
    } catch (e) { console.warn('Could not read checkins:', e.message) }

    // Compute run times
    const act1Ms = timeline.act1Start && timeline.act1End ? new Date(timeline.act1End) - new Date(timeline.act1Start) : 0
    const intMs = timeline.intermissionStart && timeline.intermissionEnd ? new Date(timeline.intermissionEnd) - new Date(timeline.intermissionStart) : 0
    const act2Ms = timeline.act2Start && timeline.act2End ? new Date(timeline.act2End) - new Date(timeline.act2Start) : 0

    const showDateLabel = new Date(showDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    // Build HTML email
    const noteRow = (n, i) => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 6px 8px; font-size: 13px; color: #333;">${n.cast || '—'}</td>
        <td style="padding: 6px 8px; font-size: 13px; color: #666;">${n.category}</td>
        <td style="padding: 6px 8px; font-size: 13px;">${n.text}</td>
        <td style="padding: 6px 8px; font-size: 12px; color: ${n.resolved ? '#22c55e' : '#ef4444'};">${n.resolved ? '✓' : '○'}</td>
      </tr>`

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Show Report — ${productionTitle}</title></head>
<body style="font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto; padding: 24px; color: #111;">

  <div style="background: #0f2340; border-radius: 12px; padding: 24px; margin-bottom: 24px; color: white;">
    <h1 style="margin: 0 0 4px; font-size: 24px;">🎭 ${productionTitle}</h1>
    <p style="margin: 0; opacity: 0.7; font-size: 14px;">Show Report — ${showDateLabel}</p>
  </div>

  ${closingNote ? `
  <div style="background: #f8faff; border-left: 4px solid #1a365d; border-radius: 4px; padding: 14px 16px; margin-bottom: 24px;">
    <p style="font-size: 13px; font-weight: 600; margin: 0 0 4px; color: #1a365d;">SM Notes</p>
    <p style="font-size: 14px; margin: 0; color: #333;">${closingNote}</p>
  </div>` : ''}

  <h2 style="font-size: 16px; margin: 0 0 12px;">⏱ Run Times</h2>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background: #f9f9f9; border-radius: 8px; overflow: hidden;">
    <tr style="background: #0f2340; color: white;">
      <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Section</th>
      <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Start</th>
      <th style="padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">End</th>
      <th style="padding: 10px 12px; text-align: right; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Duration</th>
    </tr>
    <tr><td style="padding: 8px 12px; font-size: 14px;">Act 1</td><td style="padding: 8px 12px; font-size: 14px; color: #666;">${fmtTime(timeline.act1Start)}</td><td style="padding: 8px 12px; font-size: 14px; color: #666;">${fmtTime(timeline.act1End)}</td><td style="padding: 8px 12px; font-size: 14px; text-align: right; font-weight: 600;">${fmtMs(act1Ms)}</td></tr>
    <tr style="background: #f0f0f0;"><td style="padding: 8px 12px; font-size: 14px;">Intermission</td><td style="padding: 8px 12px; font-size: 14px; color: #666;">${fmtTime(timeline.intermissionStart)}</td><td style="padding: 8px 12px; font-size: 14px; color: #666;">${fmtTime(timeline.intermissionEnd)}</td><td style="padding: 8px 12px; font-size: 14px; text-align: right; font-weight: 600; color: ${intMs > 15*60*1000 ? '#ef4444' : '#333'};">${fmtMs(intMs)}</td></tr>
    <tr><td style="padding: 8px 12px; font-size: 14px;">Act 2</td><td style="padding: 8px 12px; font-size: 14px; color: #666;">${fmtTime(timeline.act2Start)}</td><td style="padding: 8px 12px; font-size: 14px; color: #666;">${fmtTime(timeline.act2End)}</td><td style="padding: 8px 12px; font-size: 14px; text-align: right; font-weight: 600;">${fmtMs(act2Ms)}</td></tr>
    <tr style="background: #0f2340; color: white;"><td colspan="3" style="padding: 10px 12px; font-size: 14px; font-weight: 600;">Total Running Time</td><td style="padding: 10px 12px; font-size: 16px; text-align: right; font-weight: 800;">${fmtMs(act1Ms + intMs + act2Ms)}</td></tr>
  </table>

  <h2 style="font-size: 16px; margin: 0 0 12px;">👥 Attendance</h2>
  <p style="font-size: 14px; margin: 0 0 8px;">
    <strong>${checkedIn.length}</strong> checked in
    ${missingCast.length > 0 ? `· <span style="color: #ef4444;"><strong>${missingCast.length} missing:</strong> ${missingCast.join(', ')}</span>` : ' · <span style="color: #22c55e;">Full house! ✓</span>'}
  </p>

  ${tonightNotes.length > 0 ? `
  <h2 style="font-size: 16px; margin: 24px 0 12px;">📝 Tonight's Notes (${tonightNotes.length})</h2>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr style="background: #f0f0f0;">
      <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase;">Dept/Cast</th>
      <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase;">Category</th>
      <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase;">Note</th>
      <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase;">Status</th>
    </tr>
    ${tonightNotes.map(noteRow).join('')}
  </table>` : ''}

  ${openNotes.length > 0 ? `
  <h2 style="font-size: 16px; margin: 24px 0 12px;">🔓 Open Notes from Previous Nights (${openNotes.length})</h2>
  <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
    <tr style="background: #f0f0f0;">
      <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase;">Date</th>
      <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase;">Dept/Cast</th>
      <th style="padding: 8px; text-align: left; font-size: 11px; text-transform: uppercase;">Note</th>
    </tr>
    ${openNotes.map(n => `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 6px 8px; font-size: 12px; color: #666;">${n.date}</td>
        <td style="padding: 6px 8px; font-size: 13px; color: #333;">${n.cast || '—'}</td>
        <td style="padding: 6px 8px; font-size: 13px;">${n.text}</td>
      </tr>`).join('')}
  </table>` : ''}

  <p style="font-size: 12px; color: #999; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
    Sent by Ovature · ${productionTitle} · ${showDateLabel}
  </p>
</body>
</html>`

    const text = `Show Report — ${productionTitle} — ${showDateLabel}\n\nRun Times:\nAct 1: ${fmtMs(act1Ms)}\nIntermission: ${fmtMs(intMs)}\nAct 2: ${fmtMs(act2Ms)}\nTotal: ${fmtMs(act1Ms + intMs + act2Ms)}\n\nAttendance: ${checkedIn.length} in, ${missingCast.length} missing${missingCast.length > 0 ? ': ' + missingCast.join(', ') : ''}\n\nTonight's notes: ${tonightNotes.length}\nOpen notes: ${openNotes.length}${closingNote ? '\n\nSM Notes: ' + closingNote : ''}`

    const recipients = [directorEmail, smEmail].filter(Boolean)

    // Check if email is configured
    if (!process.env.RESEND_API_KEY) {
      return ok({
        sent: false,
        reason: 'email_not_configured',
        message: 'Email not configured — report not sent',
        reportPreview: text,
        reportHtml: html
      })
    }

    if (recipients.length === 0) {
      return ok({
        sent: false,
        reason: 'no_recipients',
        message: 'No email addresses configured for director or SM',
        reportPreview: text,
        reportHtml: html
      })
    }

    await resendEmail({
      to: recipients,
      subject: `Show Report — ${productionTitle} — ${showDateLabel}`,
      html,
      text
    })

    return ok({ sent: true, recipients })
  } catch (e) {
    console.error(e)
    return err('Failed to send report: ' + e.message, 500)
  }
}
