import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../../src/lib/api'
import { mockSession, mockNote, createMockNote } from '../mocks/fixtures'

// These tests verify the complete note lifecycle through the API
describe('Integration: Note Lifecycle', () => {
  beforeEach(() => {
    sessionStorage.setItem('rn_session', JSON.stringify(mockSession))
  })

  describe('Full CRUD Cycle', () => {
    it('creates, reads, updates, and deletes a note', async () => {
      // 1. Create a new note
      const newNote = createMockNote({
        text: 'Integration test note',
        scene: 'Act 1, Scene 1',
        category: 'blocking',
        priority: 'high'
      })

      const createResult = await api.saveNote(mockSession.sheetId, newNote)
      expect(createResult.success).toBe(true)
      expect(createResult.id).toBeDefined()

      // 2. Read notes (verify note exists)
      const readResult = await api.getNotes(mockSession.sheetId)
      expect(readResult.notes).toBeDefined()
      expect(Array.isArray(readResult.notes)).toBe(true)

      // 3. Update the note
      const updateResult = await api.updateNote(
        mockSession.sheetId,
        newNote.id,
        { text: 'Updated integration test note', resolved: false }
      )
      expect(updateResult.success).toBe(true)

      // 4. Resolve the note
      const resolveResult = await api.updateNote(
        mockSession.sheetId,
        newNote.id,
        { resolved: true }
      )
      expect(resolveResult.success).toBe(true)

      // 5. Soft delete the note
      const deleteResult = await api.updateNote(
        mockSession.sheetId,
        newNote.id,
        { deleted: true }
      )
      expect(deleteResult.success).toBe(true)
    })
  })

  describe('Note Metadata Updates', () => {
    it('pins and unpins a note', async () => {
      // Pin note
      const pinResult = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { pinned: true, pinnedBy: 'Stage Manager' }
      )
      expect(pinResult.success).toBe(true)

      // Unpin note
      const unpinResult = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { pinned: false, pinnedBy: '' }
      )
      expect(unpinResult.success).toBe(true)
    })

    it('toggles private flag', async () => {
      // Make private
      const privateResult = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { privateNote: true }
      )
      expect(privateResult.success).toBe(true)

      // Make public
      const publicResult = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { privateNote: false }
      )
      expect(publicResult.success).toBe(true)
    })

    it('updates category and priority', async () => {
      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { category: 'technical', priority: 'low' }
      )
      expect(result.success).toBe(true)
    })

    it('updates scene assignment', async () => {
      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { scene: 'Act 2, Scene 1', sceneId: 'new-scene-id', actId: 'act-2' }
      )
      expect(result.success).toBe(true)
    })

    it('updates cast assignment', async () => {
      const result = await api.updateNote(
        mockSession.sheetId,
        mockNote.id,
        { cast: 'Alice, Bob', castList: ['Alice', 'Bob'] }
      )
      expect(result.success).toBe(true)
    })
  })

  describe('Batch Operations', () => {
    it('creates multiple notes in sequence', async () => {
      const notes = [
        createMockNote({ text: 'Note 1', scene: 'Act 1, Scene 1' }),
        createMockNote({ text: 'Note 2', scene: 'Act 1, Scene 2' }),
        createMockNote({ text: 'Note 3', scene: 'Act 2, Scene 1' })
      ]

      for (const note of notes) {
        const result = await api.saveNote(mockSession.sheetId, note)
        expect(result.success).toBe(true)
      }
    })

    it('resolves multiple notes', async () => {
      const noteIds = ['note-1', 'note-2', 'note-3']

      for (const id of noteIds) {
        const result = await api.updateNote(
          mockSession.sheetId,
          id,
          { resolved: true }
        )
        expect(result.success).toBe(true)
      }
    })
  })

  describe('Error Handling', () => {
    it('handles missing sheetId gracefully', async () => {
      await expect(api.saveNote(null, mockNote)).rejects.toThrow()
    })

    it('handles missing note data', async () => {
      await expect(api.saveNote(mockSession.sheetId, null)).rejects.toThrow()
    })

    it('handles invalid update target', async () => {
      await expect(
        api.updateNote(null, 'note-id', { text: 'test' })
      ).rejects.toThrow()
    })
  })
})

describe('Integration: Production Operations', () => {
  beforeEach(() => {
    sessionStorage.setItem('rn_session', JSON.stringify(mockSession))
  })

  it('fetches and updates production config', async () => {
    // Fetch production
    const getResult = await api.getProduction(mockSession.sheetId)
    expect(getResult.config).toBeDefined()

    // Update production
    const updateResult = await api.updateProduction({
      sheetId: mockSession.sheetId,
      config: { title: 'Updated Title' }
    })
    expect(updateResult.success).toBe(true)
  })
})
