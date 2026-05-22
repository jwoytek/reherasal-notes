import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NoteCard from '../../../src/components/NoteCard'
import { mockNote, mockSession, mockProduction } from '../../mocks/fixtures'

// Mock the api module
vi.mock('../../../src/lib/api', () => ({
  api: {
    updateNote: vi.fn()
  }
}))

// Import the mocked module to reset it
import { api } from '../../../src/lib/api'

describe('NoteCard', () => {
  const defaultProps = {
    note: mockNote,
    sheetId: 'sheet-123',
    scenes: ['Act 1, Scene 1', 'Act 1, Scene 2'],
    scenesStruct: [],
    acts: [],
    characters: ['Alice', 'Bob', 'Charlie'],
    onUpdated: vi.fn(),
    onDeleted: vi.fn(),
    session: mockSession
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the mock implementation after clearing
    api.updateNote.mockResolvedValue({ success: true })
  })

  describe('rendering', () => {
    it('displays note text', () => {
      render(<NoteCard {...defaultProps} />)
      expect(screen.getByText(mockNote.text)).toBeInTheDocument()
    })

    it('displays note scene', () => {
      render(<NoteCard {...defaultProps} />)
      expect(screen.getByText(mockNote.scene)).toBeInTheDocument()
    })

    it('displays note category', () => {
      render(<NoteCard {...defaultProps} />)
      expect(screen.getByText(mockNote.category)).toBeInTheDocument()
    })

    it('displays note cast', () => {
      render(<NoteCard {...defaultProps} />)
      expect(screen.getByText(mockNote.cast)).toBeInTheDocument()
    })

    it('displays note date', () => {
      render(<NoteCard {...defaultProps} />)
      // Date format: "Jun 1" for 2024-06-01
      expect(screen.getByText(/Jun 1/i)).toBeInTheDocument()
    })

    it('displays resolved status with strikethrough', () => {
      const resolvedNote = { ...mockNote, resolved: true }
      render(<NoteCard {...defaultProps} note={resolvedNote} />)

      const textElement = screen.getByText(mockNote.text)
      expect(textElement).toHaveStyle({ textDecoration: 'line-through' })
    })

    it('displays pinned indicator', () => {
      const pinnedNote = { ...mockNote, pinned: true }
      const { container } = render(<NoteCard {...defaultProps} note={pinnedNote} />)

      // The pinned indicator is displayed in a styled button when pinned
      expect(container.textContent).toContain('📌')
    })

    it('displays private badge', () => {
      const privateNote = { ...mockNote, privateNote: true }
      render(<NoteCard {...defaultProps} note={privateNote} />)

      expect(screen.getByText('private')).toBeInTheDocument()
    })

    it('displays attachment link when present', () => {
      const noteWithAttachment = { ...mockNote, attachmentUrl: 'https://example.com/photo.jpg' }
      render(<NoteCard {...defaultProps} note={noteWithAttachment} />)

      expect(screen.getByText(/View attached photo/i)).toBeInTheDocument()
    })

    it('displays created by', () => {
      const noteWithCreator = { ...mockNote, createdBy: 'test@example.com' }
      render(<NoteCard {...defaultProps} note={noteWithCreator} />)

      expect(screen.getByText(/by test@example.com/i)).toBeInTheDocument()
    })
  })

  describe('actions', () => {
    it('shows resolve button for open notes', () => {
      render(<NoteCard {...defaultProps} />)
      expect(screen.getByRole('button', { name: /Resolve/i })).toBeInTheDocument()
    })

    it('shows reopen button for resolved notes', () => {
      const resolvedNote = { ...mockNote, resolved: true }
      render(<NoteCard {...defaultProps} note={resolvedNote} />)
      expect(screen.getByRole('button', { name: /Reopen/i })).toBeInTheDocument()
    })

    it('calls onUpdated when resolve is clicked', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: /Resolve/i }))

      expect(defaultProps.onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ resolved: true })
      )
    })

    it('toggles pin status', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: '📌 Pin' }))

      expect(defaultProps.onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          pinned: true,
          pinnedBy: mockSession.staffRole
        })
      )
    })

    it('toggles private status', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: '🔒' }))

      expect(defaultProps.onUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ privateNote: true })
      )
    })

    it('enters edit mode when edit button is clicked', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))

      // Should show save and cancel buttons in edit mode
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('calls onDeleted when delete is confirmed', async () => {
      // Mock window.confirm
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      expect(defaultProps.onDeleted).toHaveBeenCalledWith(mockNote.id)

      vi.restoreAllMocks()
    })

    it('does not delete when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Delete' }))

      expect(defaultProps.onDeleted).not.toHaveBeenCalled()

      vi.restoreAllMocks()
    })
  })

  describe('edit mode', () => {
    it('displays form fields in edit mode', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))

      // Check for select elements for category and priority
      expect(screen.getByText('Category')).toBeInTheDocument()
      expect(screen.getByText('Priority')).toBeInTheDocument()
      expect(screen.getByText('Cast member/Department')).toBeInTheDocument()
    })

    it('cancels edit mode and restores original values', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      // Should be back to display mode
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })

    it('saves edits and calls onUpdated', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...defaultProps} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))

      // Save without changes (tests the save flow)
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(defaultProps.onUpdated).toHaveBeenCalled()
    })
  })

  describe('with acts and structured scenes', () => {
    const propsWithActs = {
      ...defaultProps,
      acts: [
        { id: 'act-1', name: 'Act 1', order: 1 },
        { id: 'act-2', name: 'Act 2', order: 2 }
      ],
      scenesStruct: [
        { id: 'scn-1', name: 'Scene 1', actId: 'act-1', order: 1 },
        { id: 'scn-2', name: 'Scene 2', actId: 'act-1', order: 2 }
      ],
      note: { ...mockNote, actId: 'act-1', sceneId: 'scn-1' }
    }

    it('displays act name when note has actId', () => {
      render(<NoteCard {...propsWithActs} />)
      expect(screen.getByText('Act 1')).toBeInTheDocument()
    })

    it('shows act selector in edit mode', async () => {
      const user = userEvent.setup()
      render(<NoteCard {...propsWithActs} />)

      await user.click(screen.getByRole('button', { name: 'Edit' }))

      expect(screen.getByText('— any act —')).toBeInTheDocument()
    })
  })
})
