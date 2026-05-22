import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../../src/lib/api'
import { mockSession, mockNotes, mockNote, createMockNote } from '../mocks/fixtures'

// These tests verify the API layer works correctly with mocked responses
describe('Smoke: Notes CRUD Operations', () => {
  beforeEach(() => {
    // Set up authenticated session
    sessionStorage.setItem('rn_session', JSON.stringify(mockSession))
  })

  describe('Read Notes', () => {
    it('fetches notes for a production', async () => {
      const result = await api.getNotes(mockSession.sheetId)

      expect(result.notes).toBeDefined()
      expect(Array.isArray(result.notes)).toBe(true)
      expect(result.notes.length).toBeGreaterThan(0)
    })

    it('returns notes with expected structure', async () => {
      const result = await api.getNotes(mockSession.sheetId)
      const note = result.notes[0]

      expect(note).toHaveProperty('id')
      expect(note).toHaveProperty('text')
      expect(note).toHaveProperty('scene')
      expect(note).toHaveProperty('category')
      expect(note).toHaveProperty('priority')
      expect(note).toHaveProperty('resolved')
    })
  })

  describe('Create Note', () => {
    it('saves a new note successfully', async () => {
      const newNote = createMockNote({
        text: 'Test note content',
        scene: 'Act 1, Scene 1',
        category: 'Blocking'
      })

      const result = await api.saveNote(mockSession.sheetId, newNote)

      expect(result.success).toBe(true)
      expect(result.id).toBeDefined()
    })

    it('rejects notes without required fields', async () => {
      await expect(api.saveNote(null, mockNote)).rejects.toThrow()
    })
  })

  describe('Update Note', () => {
    it('updates note text', async () => {
      const changes = { text: 'Updated note text' }

      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        changes
      )

      expect(result.success).toBe(true)
    })

    it('resolves a note', async () => {
      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { resolved: true }
      )

      expect(result.success).toBe(true)
    })

    it('pins a note', async () => {
      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { pinned: true, pinnedBy: 'Stage Manager' }
      )

      expect(result.success).toBe(true)
    })

    it('updates multiple fields at once', async () => {
      const changes = {
        text: 'New text',
        priority: 'high',
        category: 'Props',
        scene: 'Act 2, Scene 1'
      }

      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        changes
      )

      expect(result.success).toBe(true)
    })
  })

  describe('Delete Note', () => {
    it('soft deletes a note', async () => {
      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { deleted: true }
      )

      expect(result.success).toBe(true)
    })
  })
})

describe('Smoke: Production Operations', () => {
  beforeEach(() => {
    sessionStorage.setItem('rn_session', JSON.stringify(mockSession))
  })

  it('fetches production config', async () => {
    const result = await api.getProduction(mockSession.sheetId)

    expect(result.config).toBeDefined()
    expect(result.config.title).toBe('Test Production')
  })

  it('updates production settings', async () => {
    const result = await api.updateProduction({
      sheetId: mockSession.sheetId,
      config: { title: 'Updated Title' }
    })

    expect(result.success).toBe(true)
  })
})

describe('Smoke: Calendar Operations', () => {
  it('fetches calendar events', async () => {
    const result = await api.getCalendar('test-calendar-id')

    expect(result.events).toBeDefined()
    expect(Array.isArray(result.events)).toBe(true)
  })
})
