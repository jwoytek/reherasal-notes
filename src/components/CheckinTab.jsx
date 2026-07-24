import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
import { api } from "../lib/api"
import { FULL_ACCESS_ROLES } from "../lib/castUtils"
import CustomAlertPanel from './CustomAlertPanel'

const POLL_INTERVAL = 20000


// QR code rendered client-side — no external service needed
function QRCanvas({ url, size = 240 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: size, margin: 2,
        color: { dark: '#111111', light: '#ffffff' }
      }).catch(() => {})
    }
  }, [url, size])
  return <canvas ref={canvasRef} style={{ borderRadius: 8, display: 'block' }} />
}

// Generate QR as data URL for printing and downloading
async function getQRDataUrl(url, size = 500) {
  try {
    return await QRCode.toDataURL(url, { width: size, margin: 2, color: { dark: '#111111', light: '#ffffff' } })
  } catch { return null }
}

async function printCheckinPage(title, url, venue) {
  const qrDataUrl = await getQRDataUrl(url, 500)
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} — Cast Check-in</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, serif;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; padding: 40px;
      background: white; color: #111;
      text-align: center;
    }
    .show-title {
      font-size: 42px; font-weight: bold;
      line-height: 1.2; margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    .venue {
      font-size: 18px; color: #555;
      margin-bottom: 40px; font-style: italic;
    }
    .qr-wrapper {
      border: 3px solid #111;
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 32px;
      display: inline-block;
    }
    .qr-wrapper img {
      display: block; width: 280px; height: 280px;
    }
    .instructions {
      font-size: 22px; font-weight: bold;
      margin-bottom: 16px; letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .steps {
      font-size: 17px; line-height: 2;
      color: #333; margin-bottom: 32px;
      list-style: none;
    }
    .steps li::before { content: "→ "; font-weight: bold; }
    .url {
      font-size: 13px; color: #888;
      font-family: monospace; margin-top: 24px;
    }
    .divider {
      width: 60px; height: 3px;
      background: #111; margin: 28px auto;
      border-radius: 2px;
    }
    @media print {
      body { padding: 20px; }
      @page { margin: 0.5in; }
    }
  </style>
</head>
<body>
  <div class="show-title">${title}</div>
  ${venue ? `<div class="venue">${venue}</div>` : '<div style="margin-bottom:40px"></div>'}
  <div class="qr-wrapper">
    <img src="${qrDataUrl}" alt="Check-in QR Code" />
  </div>
  <div class="instructions">Scan to check in</div>
  <ul class="steps">
    <li>Open your phone camera</li>
    <li>Point it at the QR code</li>
    <li>Tap your name</li>
  </ul>
  <div class="divider"></div>
  <div class="url">${url}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=700,height=900')
  win.document.write(html)
  win.document.close()
  // QR is already a data URL so no waiting needed
  setTimeout(() => { win.focus(); win.print() }, 300)
}

export default function CheckinTab({ sheetId, productionCode, production, session }) {
  const today = new Date().toLocaleDateString('en-CA') // en-CA gives YYYY-MM-DD in local time
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showQR, setShowQR] = useState(false)
  const pollRef = useRef(null)
  
  const [markingIn, setMarkingIn] = useState({})
  const absentKey = `rn_checkin_absent_${sheetId}_${date}`
  const [manualAbsent, setManualAbsent] = useState(() => {
  	try { return JSON.parse(localStorage.getItem(`rn_checkin_absent_${sheetId}_${date}`) || '{}') } catch { return {} }
  })
  const PRIVILEGED_ROLES = [...FULL_ACCESS_ROLES, 'Assistant SM', 'Asst. SM']
  const canOverride = PRIVILEGED_ROLES.includes(session?.staffRole) ||
  session?.role === 'admin' || session?.role === 'member'

  const checkinUrl = `${window.location.origin}/checkin/${productionCode}/${date}`
  const permanentUrl = `${window.location.origin}/checkin/${productionCode}`

  useEffect(() => {
    load()
    pollRef.current = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(pollRef.current)
  }, [sheetId, date])

	useEffect(() => {
	  try {
		setManualAbsent(JSON.parse(localStorage.getItem(`rn_checkin_absent_${sheetId}_${date}`) || '{}'))
	  } catch { setManualAbsent({}) }
	}, [date, sheetId])

  async function load() {
    try {
      const data = await api.getCheckinStatus(sheetId, date)
      setStatus(data)
    } catch (e) { console.warn(e) }
    finally { setLoading(false) }
  }

	async function markPresent(castEntry) {
	  setMarkingIn(m => ({ ...m, [castEntry.name]: true }))
	  try {
		await api.showCheckin({
		  productionCode,
		  showDate: date,
		  castName: castEntry.name,
		  note: 'Manually marked present'
		})
		await load()
	  } catch (e) { console.warn('Manual check-in failed:', e.message) }
	  finally { setMarkingIn(m => ({ ...m, [castEntry.name]: false })) }
	}

	function markAbsent(castName) {
	  const key = `rn_checkin_absent_${sheetId}_${date}`
	  const updated = { ...manualAbsent, [castName]: true }
	  localStorage.setItem(key, JSON.stringify(updated))
	  setManualAbsent(updated)
	}

  const castList = (status?.castList || []).map(c =>
    typeof c === 'string' ? { name: c, castMember: '' } : c
  )
  const checkins = status?.checkins || []
  const checkedInNames = new Set(checkins.map(c => c.castName))
  const notIn = castList.filter(c => !checkedInNames.has(c.name) || manualAbsent[c.name])
  const effectiveCheckedIn = checkins.filter(c => !manualAbsent[c.castName]).length
  const pct = castList.length ? Math.round((effectiveCheckedIn / castList.length) * 100) : 0

  const isShowDate = (() => {
    const showDates = production?.config?.showDates || ''
    if (!showDates) return false
    try {
      const yearMatch = showDates.match(/\b(20\d{2})\b/)
      const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear()
      const sameMonth = showDates.match(/([A-Za-z]+)\s+(\d+)\s*[-–]\s*(\d+)/)
      if (sameMonth) {
        const [, month, d1, d2] = sameMonth
        const start = new Date(`${month} ${d1}, ${year}`)
        const end = new Date(`${month} ${d2}, ${year}`)
        const check = new Date(date + 'T00:00:00')
        return check >= start && check <= end
      }
    } catch {}
    return false
  })()

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ fontSize: 13, padding: '5px 8px' }} />
        </div>
        {isShowDate && (
          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
            background: 'var(--amber-bg)', color: 'var(--amber-text)', marginTop: 14 }}>
            🎬 Show date
          </span>
        )}
        <button className="btn btn-sm" onClick={load} style={{ marginTop: 14 }}>↻ Refresh</button>
      </div>

      {/* Progress */}
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 15, fontWeight: 600 }}>{effectiveCheckedIn} / {castList.length} checked in</p>
          <span style={{ fontSize: 14, fontWeight: 600, color: pct === 100 ? 'var(--green-text)' : pct > 75 ? 'var(--amber-text)' : 'var(--red-text)' }}>
            {pct}%
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 4, transition: 'width 0.5s',
            width: `${pct}%`,
            background: pct === 100 ? 'var(--green-text)' : pct > 75 ? 'var(--amber-text)' : 'var(--red-text)'
          }} />
        </div>
        {pct === 100 && <p style={{ fontSize: 12, color: 'var(--green-text)', marginTop: 6, fontWeight: 500 }}>✅ Everyone's in!</p>}
      </div>

      {/* Permanent QR — print this one */}
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: 14, border: '1.5px solid var(--green-text)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--green-text)', marginBottom: 2 }}>🖨️ Permanent QR — print this one</p>
            <p style={{ fontSize: 11, color: 'var(--text3)' }}>Always redirects to today's date automatically</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(permanentUrl)} style={{ fontSize: 11 }}>Copy</button>
            <button className="btn btn-sm" onClick={() => setShowQR(q => !q)} style={{ fontSize: 11 }}>{showQR ? 'Hide QR' : 'Show QR'}</button>
          </div>
        </div>
        {showQR && (
          <div style={{ textAlign: 'center' }}>
            <QRCanvas url={permanentUrl} size={200} />
            <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8, fontWeight: 500 }}>{permanentUrl}</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              Print once, hang in theatre — works every rehearsal and show night
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'center' }}>
              <button className="btn btn-sm"
                onClick={async () => {
                  const dataUrl = await getQRDataUrl(permanentUrl, 600)
                  if (dataUrl) { const a = document.createElement('a'); a.href = dataUrl; a.download = 'checkin-qr.png'; a.click() }
                }}>
                Download high-res QR
              </button>
              <button className="btn btn-sm"
                onClick={() => printCheckinPage(production?.config?.title || 'Production', permanentUrl, production?.config?.venue || '')}>
                🖨️ Print sign
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Today's specific link */}
      <div style={{ background: 'var(--bg2)', borderRadius: 'var(--radius)', padding: '0.75rem 1rem', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>🔗 Today's direct link</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', wordBreak: 'break-all' }}>{checkinUrl}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(checkinUrl)} style={{ fontSize: 11 }}>Copy</button>
            <button className="btn btn-sm" onClick={() => window.open(checkinUrl, '_blank')} style={{ fontSize: 11 }}>Open</button>
          </div>
        </div>

        {/* Cast portal link */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', background: 'var(--purple-bg)', borderRadius: 'var(--radius)', border: '0.5px solid var(--border2)', marginTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, color: 'var(--purple-text)' }}>🎭 Cast portal</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', wordBreak: 'break-all' }}>{`${window.location.origin}/portal/${productionCode}`}</p>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/portal/${productionCode}`)} style={{ fontSize: 11 }}>Copy</button>
            <button className="btn btn-sm" onClick={() => window.open(`${window.location.origin}/portal/${productionCode}`, '_blank')} style={{ fontSize: 11 }}>Open</button>
          </div>
        </div>
      </div>

      {/* Custom alert */}
      <CustomAlertPanel sheetId={sheetId} production={production} isShowDay={isShowDate} />

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--red-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            ⚠ Not in ({notIn.length})
          </p>
          {notIn.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Everyone's in! 🎉</p>
            : notIn.map(c => (
			  <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', marginBottom: 4, borderRadius: 'var(--radius)',
				background: 'var(--red-bg)', border: '0.5px solid var(--red-text)', fontSize: 13, color: 'var(--red-text)' }}>
				<div>
				  <span style={{ fontWeight: 500 }}>{c.castMember || c.name}</span>
				  {c.castMember && <span style={{ fontSize: 11, opacity: 0.8, display: 'block' }}>{c.name}</span>}
				  {c.group && <span style={{ fontSize: 11, opacity: 0.8, display: 'block' }}>{c.group}</span>}
				</div>
				{canOverride && (
				  <button onClick={() => markPresent(c)} disabled={markingIn[c.name]}
					style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
					  cursor: 'pointer', border: '0.5px solid var(--green-text)',
					  background: 'var(--green-bg)', color: 'var(--green-text)',
					  opacity: markingIn[c.name] ? 0.5 : 1, flexShrink: 0, marginLeft: 8 }}>
					{markingIn[c.name] ? '…' : '✓ In'}
				  </button>
				)}
			  </div>
			))
          }
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            ✅ In ({effectiveCheckedIn})
          </p>
          {checkins.length === 0
            ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>No check-ins yet</p>
            : checkins.filter(c => !manualAbsent[c.castName]).map(c => {
              const match = castList.find(cl => cl.name === c.castName)
              const actorName = match?.castMember || null
              return (
              <div key={c.castName} style={{ padding: '7px 10px', marginBottom: 4, borderRadius: 'var(--radius)',
                background: 'var(--bg2)', border: '0.5px solid var(--border)', fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{actorName || c.castName}</span>
                    {actorName && <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 6 }}>{c.castName}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, marginLeft: 8 }}>
                    {new Date(c.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                {c.note && <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{c.note}</p>}
				{canOverride && c.note === 'Manually marked present' && (
				  <button onClick={() => markAbsent(c.castName)}
					style={{ marginTop: 4, padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500,
					  cursor: 'pointer', border: '0.5px solid var(--red-text)',
					  background: 'var(--red-bg)', color: 'var(--red-text)' }}>
					✗ Undo
				  </button>
				)}
				</div>
              )
            })
          }
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 16 }}>Auto-refreshes every 20s</p>
    </div>
  )
}
