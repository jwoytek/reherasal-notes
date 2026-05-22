import { http, HttpResponse } from 'msw'
import { mockSession, mockProduction, mockNotes } from './fixtures'

export const handlers = [
  // Authentication
  http.post('/api/authenticate', async ({ request }) => {
    const body = await request.json()
    const { productionCode, pin } = body

    // Simulate invalid credentials
    if (productionCode === 'INVALID' || pin === 'wrong') {
      return HttpResponse.json(
        { error: 'Invalid production code or PIN' },
        { status: 401 }
      )
    }

    // Simulate rate limiting
    if (productionCode === 'RATELIMIT') {
      return HttpResponse.json(
        { error: 'Too many attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }

    return HttpResponse.json(mockSession)
  }),

  // Get Production
  http.get('/api/getProduction', ({ request }) => {
    const url = new URL(request.url)
    const sheetId = url.searchParams.get('sheetId')

    if (!sheetId || sheetId === 'INVALID') {
      return HttpResponse.json(
        { error: 'Production not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(mockProduction)
  }),

  // Get Notes
  http.get('/api/getNotes', ({ request }) => {
    const url = new URL(request.url)
    const sheetId = url.searchParams.get('sheetId')

    if (!sheetId) {
      return HttpResponse.json({ error: 'Missing sheetId' }, { status: 400 })
    }

    return HttpResponse.json({ notes: mockNotes })
  }),

  // Save Note
  http.post('/api/saveNote', async ({ request }) => {
    const body = await request.json()
    const { sheetId, note } = body

    if (!sheetId || !note) {
      return HttpResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    return HttpResponse.json({
      success: true,
      id: note.id || `note-${Date.now()}`
    })
  }),

  // Update Note
  http.post('/api/updateNote', async ({ request }) => {
    const body = await request.json()
    const { sheetId, id, changes } = body

    if (!sheetId || !id) {
      return HttpResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    return HttpResponse.json({ success: true })
  }),

  // Update Production
  http.post('/api/updateProduction', async ({ request }) => {
    const body = await request.json()

    if (!body.sheetId) {
      return HttpResponse.json({ error: 'Missing sheetId' }, { status: 400 })
    }

    return HttpResponse.json({ success: true })
  }),

  // Calendar
  http.get('/api/getCalendar', () => {
    return HttpResponse.json({ events: [] })
  }),

  // Files
  http.get('/api/getFiles', () => {
    return HttpResponse.json({ files: [] })
  }),

  // Auditions
  http.get('/api/getAuditioners', () => {
    return HttpResponse.json({ auditioners: [] })
  }),

  http.get('/api/getAuditionForm', ({ request }) => {
    const url = new URL(request.url)
    const productionCode = url.searchParams.get('productionCode')

    if (!productionCode) {
      return HttpResponse.json({ error: 'Missing productionCode' }, { status: 400 })
    }

    return HttpResponse.json({
      title: 'Test Production',
      customFields: []
    })
  }),

  // Check-in
  http.get('/api/getCheckinStatus', () => {
    return HttpResponse.json({ checkins: [] })
  })
]

// Handler overrides for specific test scenarios
export const errorHandlers = {
  serverError: http.get('/api/getProduction', () => {
    return HttpResponse.json({ error: 'Internal server error' }, { status: 500 })
  }),

  offline: http.get('/api/getProduction', () => {
    return HttpResponse.json({ offline: true }, { status: 503 })
  }),

  networkError: http.get('/api/getProduction', () => {
    return HttpResponse.error()
  })
}
