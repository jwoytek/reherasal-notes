import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import App from '../../src/App'

function renderApp() {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  )
}

describe('Smoke: Application Bootstrap', () => {
  it('renders without crashing', () => {
    renderApp()
    // App should render some content
    expect(document.body).toBeDefined()
  })

  it('displays the landing page by default', () => {
    renderApp()
    // Landing page shows the production code input and tagline
    expect(screen.getByText(/Theater Production Platform/i)).toBeInTheDocument()
  })

  it('shows the login form', () => {
    renderApp()
    // Should have production code input
    expect(screen.getByPlaceholderText(/SPEL7K2/i)).toBeInTheDocument()
    // Should have PIN input
    expect(screen.getByPlaceholderText(/Your PIN/i)).toBeInTheDocument()
    // Should have submit button
    expect(screen.getByRole('button', { name: /Enter production/i })).toBeInTheDocument()
  })

  it('shows navigation options', () => {
    renderApp()
    // Create production link
    expect(screen.getByRole('button', { name: /Create one/i })).toBeInTheDocument()
    // Recovery link
    expect(screen.getByRole('button', { name: /Forgot production code/i })).toBeInTheDocument()
  })
})
