'use strict'

const {
  sheetsClient, driveClient, getRows, appendRows,
  hashPin, makeProductionCode, REGISTRY_SHEET_ID, SHARED_DRIVE_ID, CORS, ok, err
} = require('./_sheets')
const { defaultActs, migrateConfig } = require('./_actsScenes')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405)

  let body
  try { body = JSON.parse(event.body) } catch { return err('Invalid JSON') }

  const {
    title, pin, adminPin, directorName, directorEmail, showDates,
    scenes, acts, actCount, characters, staff, useAuditions
  } = body
  if (!title || !pin) return err('Title and PIN are required')
  if (pin.length < 4) return err('PIN must be at least 4 characters')

  try {
    const sheets = await sheetsClient()
    const drive = await driveClient()

    // 1. Create production root folder
    const rootFolder = await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: title, mimeType: 'application/vnd.google-apps.folder', parents: [SHARED_DRIVE_ID] },
      fields: 'id'
    })
    const rootFolderId = rootFolder.data.id

    // 2. Create subfolders
    const [attachFolder, docsFolder] = await Promise.all([
      drive.files.create({ supportsAllDrives: true, requestBody: { name: 'Note Attachments', mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] }, fields: 'id' }),
      drive.files.create({ supportsAllDrives: true, requestBody: { name: 'Production Documents', mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] }, fields: 'id' })
    ])
    const attachFolderId = attachFolder.data.id
    const docsFolderId = docsFolder.data.id

    // 3. Audition folders (if enabled)
    let auditionFolderId = ''
    let headshotFolderId = ''
    if (useAuditions) {
      const audFolder = await drive.files.create({
        supportsAllDrives: true,
        requestBody: { name: 'Auditions', mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] },
        fields: 'id'
      })
      auditionFolderId = audFolder.data.id
      const hsFolder = await drive.files.create({
        supportsAllDrives: true,
        requestBody: { name: 'Headshots', mimeType: 'application/vnd.google-apps.folder', parents: [auditionFolderId] },
        fields: 'id'
      })
      headshotFolderId = hsFolder.data.id
    }

    // 4. Create production sheet
    const driveFile = await drive.files.create({
      supportsAllDrives: true,
      requestBody: { name: `Production Sheet — ${title}`, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [rootFolderId] },
      fields: 'id'
    })
    const productionSheetId = driveFile.data.id

    // 5. Set up sheet tabs
    const addSheets = [
      { updateSheetProperties: { properties: { sheetId: 0, title: 'Notes' }, fields: 'title' } },
      { addSheet: { properties: { title: 'Config' } } },
      { addSheet: { properties: { title: 'SharedWith' } } }
    ]
    if (useAuditions) {
      addSheets.push({ addSheet: { properties: { title: 'Auditioners' } } })
      addSheets.push({ addSheet: { properties: { title: 'AuditionNotes' } } })
    }
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: productionSheetId, requestBody: { requests: addSheets } })

    // 6. Notes header — A:U (21 cols, includes actId + sceneId)
    await sheets.spreadsheets.values.update({
      spreadsheetId: productionSheetId, range: 'Notes!A1:U1', valueInputOption: 'RAW',
      requestBody: { values: [['id','date','scene','category','priority','cast','cue','swTime','text','resolved','createdAt','updatedAt','createdBy','deleted','carriedOver','attachmentUrl','pinned','privateNote','pinnedBy','actId','sceneId']] }
    })

    // 7. Auditioners header
    if (useAuditions) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: productionSheetId, range: 'Auditioners!A1:P1', valueInputOption: 'RAW',
        requestBody: { values: [['id','submittedAt','firstName','lastName','email','phone','grade','age','experience','conflicts','headshotUrl','editToken','customAnswers','role','castConfirmed','deleted']] }
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId: productionSheetId, range: 'AuditionNotes!A1:F1', valueInputOption: 'RAW',
        requestBody: { values: [['id','auditionerId','text','createdBy','createdAt','deleted']] }
      })
    }

    // 8. Config tab
    // Build the new acts/scenes structure. Three input shapes are handled:
    //   (a) caller passed { acts: [...], scenes: [{id, name, actId, ...}] } — use as-is
    //   (b) caller passed legacy { scenes: ["Act 1, Scene 2", ...] } — migrate
    //   (c) caller passed nothing — start with N default acts (actCount or 2)
    //       and an empty scenes array
    let finalActs, finalScenes
    if (Array.isArray(acts) && acts.length && Array.isArray(scenes) && (scenes.length === 0 || typeof scenes[0] === 'object')) {
      // Shape (a)
      finalActs = acts
      finalScenes = scenes
    } else if (Array.isArray(scenes) && scenes.length && typeof scenes[0] === 'string') {
      // Shape (b) — legacy flat strings, run through migrator
      const migrated = migrateConfig({ scenes })
      finalActs = migrated.acts
      finalScenes = migrated.scenes
    } else {
      // Shape (c) — fresh start
      finalActs = defaultActs(actCount || 2)
      finalScenes = []
    }

    const configData = [
      ['title', title],
      ['directorName', directorName || ''],
      ['directorEmail', directorEmail || ''],
      ['showDates', showDates || ''],
      ['venue', ''],
      ['calendarId', ''],
      ['acts', JSON.stringify(finalActs)],
      ['scenes', JSON.stringify(finalScenes)],
      ['characters', JSON.stringify(characters || [])],
      ['staff', JSON.stringify(staff || [])],
      ['rootFolderId', rootFolderId],
      ['attachFolderId', attachFolderId],
      ['docsFolderId', docsFolderId],
      ['auditionFolderId', auditionFolderId],
      ['headshotFolderId', headshotFolderId],
      ['useAuditions', useAuditions ? 'true' : 'false'],
      ['auditionQuestions', JSON.stringify([])],
      ['createdAt', new Date().toISOString()]
    ]
    await sheets.spreadsheets.values.update({
      spreadsheetId: productionSheetId, range: 'Config!A1:B30', valueInputOption: 'RAW',
      requestBody: { values: configData }
    })

    // 9. SharedWith header
    await sheets.spreadsheets.values.update({
      spreadsheetId: productionSheetId, range: 'SharedWith!A1:F1', valueInputOption: 'RAW',
      requestBody: { values: [['name','email','pinHash','inviteCode','activated','role']] }
    })

    // 10. Register in Registry
    const productionCode = makeProductionCode(title)
    const pinHash = hashPin(pin)
    const adminPinHash = adminPin ? hashPin(adminPin) : pinHash

    const registryRows = await getRows(sheets, REGISTRY_SHEET_ID, 'Registry!A:A')
    if (registryRows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: REGISTRY_SHEET_ID, range: 'Registry!A1:F1', valueInputOption: 'RAW',
        requestBody: { values: [['productionCode','title','sheetId','pinHash','adminPinHash','createdAt']] }
      })
    }
    await appendRows(sheets, REGISTRY_SHEET_ID, 'Registry!A:F', [
      [productionCode, title, productionSheetId, pinHash, adminPinHash, new Date().toISOString()]
    ])

    return ok({ productionCode, message: 'Production created successfully' })
  } catch (e) {
    console.error(e)
    return err('Failed to create production: ' + e.message, 500)
  }
}
