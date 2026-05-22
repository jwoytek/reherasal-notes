// Session fixture
export const mockSession = {
  productionCode: 'TEST123',
  sheetId: 'sheet-abc-123',
  title: 'Test Production',
  role: 'admin',
  name: 'Test User',
  email: 'test@example.com',
  staffRole: 'Stage Manager',
  ntfyTopic: 'test-topic',
  phone: '555-1234'
}

export const mockMemberSession = {
  ...mockSession,
  role: 'member',
  staffRole: 'Cast',
  name: 'Cast Member'
}

// Production fixture
export const mockProduction = {
  config: {
    title: 'Test Production',
    showDates: 'June 15-30, 2024',
    venue: 'Test Theater',
    acts: [
      { id: 'act1', name: 'Act 1' },
      { id: 'act2', name: 'Act 2' }
    ],
    scenes: [
      { id: 'scene1', actId: 'act1', name: 'Scene 1' },
      { id: 'scene2', actId: 'act1', name: 'Scene 2' },
      { id: 'scene3', actId: 'act2', name: 'Scene 1' }
    ],
    cast: ['Alice', 'Bob', 'Charlie'],
    categories: ['Blocking', 'Props', 'Costumes', 'Lights', 'Sound']
  }
}

// Note fixtures
export const mockNote = {
  id: 'note-1',
  date: '2024-06-01',
  scene: 'Act 1, Scene 2',
  sceneId: 'scene2',
  actId: 'act1',
  category: 'Blocking',
  priority: 'high',
  cast: 'Alice',
  cue: 'After entrance',
  text: 'Move downstage on line 5',
  resolved: false,
  createdAt: '2024-06-01T10:00:00Z',
  updatedAt: '2024-06-01T10:00:00Z',
  createdBy: 'test@example.com',
  deleted: false,
  carriedOver: false,
  attachmentUrl: null,
  pinned: false,
  privateNote: false,
  pinnedBy: null
}

export const mockNotes = [
  mockNote,
  {
    ...mockNote,
    id: 'note-2',
    scene: 'Act 1, Scene 1',
    sceneId: 'scene1',
    category: 'Props',
    priority: 'medium',
    cast: 'Bob',
    text: 'Check prop placement',
    resolved: true
  },
  {
    ...mockNote,
    id: 'note-3',
    scene: 'Act 2, Scene 1',
    sceneId: 'scene3',
    actId: 'act2',
    category: 'Costumes',
    priority: 'low',
    cast: 'Charlie',
    text: 'Quick change needed',
    pinned: true
  }
]

// Calendar event fixture
export const mockEvent = {
  id: 'event-1',
  title: 'Rehearsal',
  start: '2024-06-01T18:00:00',
  end: '2024-06-01T22:00:00',
  description: 'Run Act 1'
}

// Helper to create custom notes
export function createMockNote(overrides = {}) {
  return {
    ...mockNote,
    id: `note-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }
}
