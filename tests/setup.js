import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, afterAll, vi } from 'vitest'
import { server } from './mocks/server'

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

// Reset handlers after each test
afterEach(() => {
  cleanup()
  server.resetHandlers()
})

// Stop server after all tests
afterAll(() => server.close())

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i) => Object.keys(store)[i] ?? null
  }
})()

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock })

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value) },
    removeItem: (key) => { delete store[key] },
    clear: () => { store = {} },
    get length() { return Object.keys(store).length },
    key: (i) => Object.keys(store)[i] ?? null
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Clear storage between tests
afterEach(() => {
  sessionStorageMock.clear()
  localStorageMock.clear()
})

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  value: true,
  writable: true
})

// Mock Element.scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()

// Mock requestAnimationFrame/cancelAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 0))
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id))

// Mock Canvas API (not available in jsdom)
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  drawImage: vi.fn(),
  createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  measureText: vi.fn(() => ({ width: 0 })),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  canvas: { width: 0, height: 0 },
  globalAlpha: 1,
  fillStyle: '',
  strokeStyle: '',
}))

HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,mock')

// Mock URL.createObjectURL / revokeObjectURL
URL.createObjectURL = vi.fn(() => 'blob:mock-url')
URL.revokeObjectURL = vi.fn()

// Mock Image constructor (for image loading in canvas operations)
class MockImage {
  constructor() {
    setTimeout(() => {
      this.width = 100
      this.height = 100
      this.onload?.()
    }, 0)
  }
}
global.Image = MockImage

// Mock navigator.clipboard (configurable so user-event can override)
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve('')),
  },
  writable: true,
  configurable: true
})

// Mock navigator.mediaDevices (for camera access)
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(() => Promise.resolve({
      getTracks: () => [{ stop: vi.fn() }],
    })),
    enumerateDevices: vi.fn(() => Promise.resolve([])),
  },
  writable: true
})

// Mock window.open
window.open = vi.fn(() => ({
  document: {
    write: vi.fn(),
    close: vi.fn(),
  },
  focus: vi.fn(),
  close: vi.fn(),
}))

// Mock window.confirm / window.alert / window.prompt
window.confirm = vi.fn(() => true)
window.alert = vi.fn()
window.prompt = vi.fn(() => null)

// Mock SpeechRecognition (for voice input)
class MockSpeechRecognition {
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  onresult = null
  onerror = null
  onend = null
  continuous = false
  interimResults = false
  lang = ''
}
window.SpeechRecognition = MockSpeechRecognition
window.webkitSpeechRecognition = MockSpeechRecognition

// Mock matchMedia (for responsive design queries)
window.matchMedia = vi.fn((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.ResizeObserver = MockResizeObserver

// Mock IntersectionObserver
class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback
  }
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.IntersectionObserver = MockIntersectionObserver
