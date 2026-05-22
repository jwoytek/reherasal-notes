import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../../src/App'
import { mockSession } from '../mocks/fixtures'

describe('Integration: Session Flow', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  describe('Login Flow', () => {
    it('redirects to production page after successful login', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      // Fill login form
      await user.type(screen.getByPlaceholderText(/SPEL7K2/i), 'TEST123')
      await user.type(screen.getByPlaceholderText(/Your PIN/i), '1234')
      await user.click(screen.getByRole('button', { name: /Enter production/i }))

      // Wait for session to be stored
      await waitFor(() => {
        const session = sessionStorage.getItem('rn_session')
        expect(session).not.toBeNull()
      })
    })

    it('persists session across page renders', async () => {
      // Pre-populate session
      sessionStorage.setItem('rn_session', JSON.stringify(mockSession))

      const { unmount } = render(
        <MemoryRouter initialEntries={['/production']}>
          <App />
        </MemoryRouter>
      )

      // Session should still exist
      expect(sessionStorage.getItem('rn_session')).not.toBeNull()

      // Unmount and re-render
      unmount()

      render(
        <MemoryRouter initialEntries={['/production']}>
          <App />
        </MemoryRouter>
      )

      // Session should persist
      expect(sessionStorage.getItem('rn_session')).not.toBeNull()
    })

    it('clears greeting flag on login', async () => {
      // Set a greeting flag
      sessionStorage.setItem('rn_greeted_sheet-abc-123', 'true')

      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      await user.type(screen.getByPlaceholderText(/SPEL7K2/i), 'TEST123')
      await user.type(screen.getByPlaceholderText(/Your PIN/i), '1234')
      await user.click(screen.getByRole('button', { name: /Enter production/i }))

      await waitFor(() => {
        const greetingFlag = sessionStorage.getItem('rn_greeted_sheet-abc-123')
        expect(greetingFlag).toBeNull()
      })
    })
  })

  describe('Protected Routes', () => {
    it('redirects to landing page when accessing /production without session', () => {
      render(
        <MemoryRouter initialEntries={['/production']}>
          <App />
        </MemoryRouter>
      )

      // Should show login form
      expect(screen.getByPlaceholderText(/Your PIN/i)).toBeInTheDocument()
    })

    it('redirects to landing page when accessing /setup without session', () => {
      render(
        <MemoryRouter initialEntries={['/setup']}>
          <App />
        </MemoryRouter>
      )

      expect(screen.getByPlaceholderText(/Your PIN/i)).toBeInTheDocument()
    })

    it('allows access to public routes without session', () => {
      render(
        <MemoryRouter initialEntries={['/help']}>
          <App />
        </MemoryRouter>
      )

      // Help page should load (no redirect to login)
      expect(screen.queryByPlaceholderText(/Your PIN/i)).not.toBeInTheDocument()
    })
  })

  describe('Recovery Flow', () => {
    it('shows recovery form when clicking forgot link', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      await user.click(screen.getByRole('button', { name: /Forgot production code/i }))

      expect(screen.getByText(/Director email/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/email@example.com/i)).toBeInTheDocument()
    })

    it('returns to login from recovery screen', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      await user.click(screen.getByRole('button', { name: /Forgot production code/i }))
      await user.click(screen.getByRole('button', { name: /Back to sign in/i }))

      expect(screen.getByPlaceholderText(/Your PIN/i)).toBeInTheDocument()
    })
  })

  describe('Create Production Link', () => {
    it('navigates to create page when clicking create link', async () => {
      const user = userEvent.setup()
      render(
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      )

      await user.click(screen.getByRole('button', { name: /Create one/i }))

      // Should navigate to /create route
      expect(screen.queryByPlaceholderText(/Your PIN/i)).not.toBeInTheDocument()
    })
  })
})
