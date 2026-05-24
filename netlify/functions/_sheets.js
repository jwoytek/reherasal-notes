'use strict'

const { google } = require('googleapis')

const REGISTRY_SHEET_ID = process.env.REGISTRY_SHEET_ID
const SHARED_DRIVE_ID = process.env.SHARED_DRIVE_ID

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
  let creds
  try {
    creds = JSON.parse(json)
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ' + e.message)
  }
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
  })
}

async function sheetsClient() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

async function driveClient() {
  const auth = getAuth()
  return google.drive({ version: 'v3', auth })
}

async function getRows(sheets, spreadsheetId, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  return res.data.values || []
}

async function appendRows(sheets, spreadsheetId, range, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  })
}

async function updateRow(sheets, spreadsheetId, sheetName, rowIndex, values) {
  const range = `${sheetName}!A${rowIndex}:Z${rowIndex}`
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [values] }
  })
}

function hashPin(pin) {
  let hash = 5381
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) + hash) + pin.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

function makeProductionCode(title) {
  const slug = title.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase()
  return slug + rand
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
}

function ok(body) {
  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

function err(msg, code = 400) {
  return { statusCode: code, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: msg }) }
}

/**
 * Ensures the Registry tab exists in the registry spreadsheet.
 * - If "Registry" tab exists, returns { ok: true }
 * - If spreadsheet has one empty tab, renames it to "Registry" and returns { ok: true, initialized: true }
 * - Otherwise returns { ok: false, error: "..." }
 */
async function ensureRegistryTab(sheets) {
  if (!REGISTRY_SHEET_ID) {
    return { ok: false, error: 'REGISTRY_SHEET_ID environment variable is not set' }
  }

  try {
    // Get spreadsheet metadata
    const meta = await sheets.spreadsheets.get({ spreadsheetId: REGISTRY_SHEET_ID })
    const sheetsList = meta.data.sheets || []

    // Check if Registry tab already exists
    const registryTab = sheetsList.find(s => s.properties.title === 'Registry')
    if (registryTab) {
      return { ok: true }
    }

    // No Registry tab — check if we can auto-configure
    if (sheetsList.length === 1) {
      const firstSheet = sheetsList[0]
      const sheetId = firstSheet.properties.sheetId
      const sheetTitle = firstSheet.properties.title

      // Check if the sheet is empty
      try {
        const data = await sheets.spreadsheets.values.get({
          spreadsheetId: REGISTRY_SHEET_ID,
          range: `'${sheetTitle}'!A1:Z100`
        })
        const values = data.data.values || []
        const hasData = values.some(row => row.some(cell => cell && cell.trim()))

        if (!hasData) {
          // Empty spreadsheet — rename the tab to "Registry"
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: REGISTRY_SHEET_ID,
            requestBody: {
              requests: [{
                updateSheetProperties: {
                  properties: { sheetId, title: 'Registry' },
                  fields: 'title'
                }
              }]
            }
          })
          return { ok: true, initialized: true }
        }
      } catch (e) {
        // If we can't read the data, fall through to error
      }
    }

    // Can't auto-configure — return helpful error
    const tabNames = sheetsList.map(s => s.properties.title).join(', ')
    return {
      ok: false,
      error: `Registry sheet is not configured correctly. Expected a tab named "Registry" but found: ${tabNames}. ` +
             `Either rename an existing tab to "Registry", or use an empty spreadsheet which will be configured automatically.`
    }
  } catch (e) {
    if (e.code === 404 || e.message?.includes('not found')) {
      return { ok: false, error: 'Registry spreadsheet not found. Check that REGISTRY_SHEET_ID is correct and the sheet is shared with the service account.' }
    }
    if (e.code === 403 || e.message?.includes('permission')) {
      return { ok: false, error: 'Cannot access registry spreadsheet. Make sure it is shared with the service account email.' }
    }
    return { ok: false, error: `Failed to access registry spreadsheet: ${e.message}` }
  }
}

module.exports = {
  getAuth, sheetsClient, driveClient, getRows, appendRows, updateRow,
  hashPin, makeProductionCode, CORS, ok, err, REGISTRY_SHEET_ID, SHARED_DRIVE_ID,
  ensureRegistryTab
}
