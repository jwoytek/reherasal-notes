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

module.exports = {
  getAuth, sheetsClient, driveClient, getRows, appendRows, updateRow,
  hashPin, makeProductionCode, CORS, ok, err, REGISTRY_SHEET_ID, SHARED_DRIVE_ID
}
