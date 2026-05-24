'use strict'

const {
  sheetsClient, getRows, hashPin,
  REGISTRY_SHEET_ID, CORS, ok, err, ensureRegistryTab
} = require('./_sheets')

const attempts = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const window = 15 * 60 * 1000
  const max = 10
  const key = ip || 'unknown'
  const entry = attempts.get(key) || { count: 0, start: now }
  if (now - entry.start > window) {
    attempts.set(key, { count: 1, start: now })
    return false
  }
  entry.count++
  attempts.set(key, entry)
  return entry.count > max
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405)

  const clientIp = event.headers?.['x-forwarded-for']?.split(',')[0] || event.headers?.['client-ip'] || ''
  if (isRateLimited(clientIp)) return err('Too many attempts. Please wait 15 minutes.', 429)

  let body
  try { body = JSON.parse(event.body) } catch { return err('Invalid JSON') }

  const { productionCode, pin, newPin } = body
  if (!productionCode || !pin) return err('Production code and PIN are required')

  try {
    const sheets = await sheetsClient()

    // Ensure Registry tab exists
    const registryCheck = await ensureRegistryTab(sheets)
    if (!registryCheck.ok) {
      return err(registryCheck.error, 500)
    }

    const rows = await getRows(sheets, REGISTRY_SHEET_ID, 'Registry!A:F')
    if (rows.length < 2) return err('Production not found', 404)

    const [header, ...data] = rows
    const codeIdx = header.indexOf('productionCode')
    const titleIdx = header.indexOf('title')
    const sheetIdx = header.indexOf('sheetId')
    const pinIdx = header.indexOf('pinHash')
    const adminPinIdx = header.indexOf('adminPinHash')

    const row = data.find(r => r[codeIdx] === productionCode.toUpperCase())
    if (!row) return err('Production not found', 404)

    const pinHash = hashPin(pin)
    const isAdmin = pinHash === row[adminPinIdx]
    const isMember = pinHash === row[pinIdx]

    if (!isAdmin && !isMember) {
      const sheetId = row[sheetIdx]
      const sharedRows = await getRows(sheets, sheetId, 'SharedWith!A:I')

      if (sharedRows.length > 1) {
        const [sh, ...sdata] = sharedRows
        const nameIdx = sh.indexOf('name')
        const emailIdx = sh.indexOf('email')
        const phIdx = sh.indexOf('pinHash')
        const inviteIdx = sh.indexOf('inviteCode')
        const activatedIdx = sh.indexOf('activated')
        const roleIdx = sh.indexOf('role')
        const staffRoleIdx = sh.indexOf('staffRole')
        const ntfyIdx = sh.indexOf('ntfyTopic')
        const phoneIdx = sh.indexOf('phone')

        // Try PIN match first
        let sharedRow = sdata.find(r => r[phIdx] && r[phIdx] === pinHash)
        let rowIndex = sdata.indexOf(sharedRow)

        if (sharedRow) {
          const memberRole = roleIdx >= 0 && sharedRow[roleIdx] === 'admin' ? 'admin' : 'shared'
          return ok({
            productionCode: productionCode.toUpperCase(),
            title: row[titleIdx],
            sheetId,
            role: memberRole,
            name: sharedRow[nameIdx] || '',
            email: sharedRow[emailIdx] || '',
            staffRole: staffRoleIdx >= 0 ? (sharedRow[staffRoleIdx] || '') : '',
            ntfyTopic: ntfyIdx >= 0 ? (sharedRow[ntfyIdx] || '') : '',
            phone: phoneIdx >= 0 ? (sharedRow[phoneIdx] || '') : ''
          })
        }

        // Try invite code match
        const inviteUpper = pin.toUpperCase()
        sharedRow = sdata.find(r =>
          r[inviteIdx] === inviteUpper && r[activatedIdx] !== 'true'
        )
        rowIndex = sdata.indexOf(sharedRow)

        if (sharedRow) {
          if (!newPin) {
            return ok({
              status: 'invite_valid',
              productionCode: productionCode.toUpperCase(),
              title: row[titleIdx],
              sheetId,
              name: sharedRow[nameIdx] || '',
              email: sharedRow[emailIdx] || '',
              inviteCode: inviteUpper,
              staffRole: staffRoleIdx >= 0 ? (sharedRow[staffRoleIdx] || '') : ''
            })
          }

          if (newPin.length < 4) return err('PIN must be at least 4 characters')

          const newPinHash = hashPin(newPin)
          const sheetRowIndex = rowIndex + 2

          const updatedRow = [...sharedRow]
          while (updatedRow.length < 9) updatedRow.push('')
          updatedRow[phIdx] = newPinHash
          updatedRow[inviteIdx] = ''
          updatedRow[activatedIdx] = 'true'

          await sheets.spreadsheets.values.update({
            spreadsheetId: sheetId,
            range: `SharedWith!A${sheetRowIndex}:I${sheetRowIndex}`,
            valueInputOption: 'RAW',
            requestBody: { values: [updatedRow] }
          })

          const activatedRole = roleIdx >= 0 && sharedRow[roleIdx] === 'admin' ? 'admin' : 'shared'
          return ok({
            productionCode: productionCode.toUpperCase(),
            title: row[titleIdx],
            sheetId,
            role: activatedRole,
            name: sharedRow[nameIdx] || '',
            email: sharedRow[emailIdx] || '',
            staffRole: staffRoleIdx >= 0 ? (sharedRow[staffRoleIdx] || '') : '',
            ntfyTopic: ntfyIdx >= 0 ? (sharedRow[ntfyIdx] || '') : '',
            phone: phoneIdx >= 0 ? (sharedRow[phoneIdx] || '') : ''
          })
        }
      }

      return err('Incorrect PIN or invite code', 401)
    }

    // Admin/member — pull director info from config
    let directorName = ''
    let directorEmail = ''
    try {
      const configRows = await getRows(sheets, row[sheetIdx], 'Config!A:B')
      const nameRow = configRows.find(r => r[0] === 'directorName')
      const emailRow = configRows.find(r => r[0] === 'directorEmail')
      if (nameRow) directorName = nameRow[1] || ''
      if (emailRow) directorEmail = emailRow[1] || ''
    } catch (e) {
      console.warn('Could not read director info:', e.message)
    }

    return ok({
      productionCode: productionCode.toUpperCase(),
      title: row[titleIdx],
      sheetId: row[sheetIdx],
      role: isAdmin ? 'admin' : 'member',
      name: directorName,
      email: directorEmail,
      staffRole: 'Stage Manager'
    })
  } catch (e) {
    console.error(e)
    return err('Authentication failed: ' + e.message, 500)
  }
}
