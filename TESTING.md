# Testing Guide

This project uses [Vitest](https://vitest.dev/) with React Testing Library for testing.

## Quick Start

```bash
# Run all tests
npm test

# Run smoke tests only (fast, ~1s)
npm run test:smoke

# Run full regression suite
npm run test:regression

# Watch mode for development
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Test Modes

### Smoke Tests
Quick validation tests that verify core functionality works. These run:
- On every Netlify deploy (before build)
- As a fast feedback job in GitHub Actions

**What they cover:**
- App bootstraps without crashing
- Authentication flow works
- Basic CRUD operations succeed

### Regression Tests
Comprehensive test suite including all smoke tests plus:
- Unit tests for utility modules (`lib/`)
- Component tests
- Integration tests

## Project Structure

```
tests/
├── setup.js              # Global test setup (MSW, jsdom mocks)
├── mocks/
│   ├── server.js         # MSW server instance
│   ├── handlers.js       # API mock handlers
│   └── fixtures/
│       └── index.js      # Test data (sessions, notes, etc.)
├── smoke/                # Smoke tests
│   ├── bootstrap.test.jsx
│   ├── auth.test.jsx
│   └── notes-crud.test.jsx
├── unit/                 # Unit tests
│   ├── lib/              # Utility module tests
│   │   ├── castUtils.test.js
│   │   ├── hashtags.test.js
│   │   └── actsScenes.test.js
│   └── components/       # Component tests
│       └── NoteCard.test.jsx
└── integration/          # Integration tests
    ├── session-flow.test.jsx
    └── note-flow.test.jsx
```

## Writing Tests

### Basic Component Test

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MyComponent from '../src/components/MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('handles user interaction', async () => {
    const user = userEvent.setup()
    render(<MyComponent />)

    await user.click(screen.getByRole('button'))
    expect(screen.getByText('Clicked!')).toBeInTheDocument()
  })
})
```

### Mocking the API

The API is mocked using MSW (Mock Service Worker). Default handlers are in `tests/mocks/handlers.js`.

To override a handler for a specific test:

```js
import { server } from '../mocks/server'
import { http, HttpResponse } from 'msw'

it('handles API errors', async () => {
  server.use(
    http.get('/api/getNotes', () => {
      return HttpResponse.json({ error: 'Server error' }, { status: 500 })
    })
  )

  // Test error handling...
})
```

### Using Test Fixtures

```js
import { mockSession, mockNote, createMockNote } from '../mocks/fixtures'

// Use pre-defined fixtures
const note = mockNote

// Create custom fixtures
const customNote = createMockNote({
  text: 'Custom note text',
  priority: 'high'
})
```

### Testing with Router

Wrap components that use React Router:

```jsx
import { MemoryRouter } from 'react-router-dom'

render(
  <MemoryRouter initialEntries={['/production']}>
    <App />
  </MemoryRouter>
)
```

### Testing with Session

Pre-populate session storage for authenticated tests:

```js
beforeEach(() => {
  sessionStorage.setItem('rn_session', JSON.stringify(mockSession))
})
```

## CI/CD Integration

### GitHub Actions
Tests run automatically on push/PR to `main`:
- `smoke` job: Fast feedback
- `regression` job: Full coverage
- `coverage` job: Generates coverage report

### Netlify
Smoke tests run before every deploy:
```
npm run test:smoke && npm run build
```

If tests fail, the deploy is aborted.

## Coverage

Generate a coverage report:

```bash
npm run test:coverage
```

Coverage reports are saved to `coverage/` and include:
- Terminal summary
- HTML report (`coverage/index.html`)
- JSON data (`coverage/coverage-final.json`)

## Troubleshooting

### "Cannot read properties of undefined"
If mocking a module, ensure mock implementations are reset in `beforeEach`:

```js
import { api } from '../src/lib/api'

beforeEach(() => {
  vi.clearAllMocks()
  api.someMethod.mockResolvedValue({ success: true })
})
```

### React Router warnings
These warnings about future flags are expected and don't affect tests:
```
React Router Future Flag Warning: React Router will begin wrapping state updates...
```

### "Not wrapped in act(...)" warnings
These typically occur with async state updates. Use `waitFor` or ensure all updates complete:

```js
await waitFor(() => {
  expect(screen.getByText('Updated')).toBeInTheDocument()
})
```
