import { describe, it, expect } from 'vitest'
import {
  newActId,
  newSceneId,
  defaultActs,
  isLegacyConfig,
  migrateConfig,
  migrateNote,
  findAct,
  findScene,
  formatActScene,
  groupScenesByAct,
  addAct,
  renameAct,
  removeAct,
  reorderActs,
  addScene,
  renameScene,
  removeScene,
  moveSceneToAct,
  resolveActTag,
  sceneNames,
  isStructuredScenes,
  findSceneByName,
  ensureMigrated
} from '../../../src/lib/actsScenes'

describe('actsScenes', () => {
  describe('ID generation', () => {
    it('generates unique act IDs', () => {
      const id1 = newActId()
      const id2 = newActId()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^act-/)
    })

    it('generates unique scene IDs', () => {
      const id1 = newSceneId()
      const id2 = newSceneId()
      expect(id1).not.toBe(id2)
      expect(id1).toMatch(/^scn-/)
    })
  })

  describe('defaultActs', () => {
    it('creates default number of acts', () => {
      const acts = defaultActs(2)
      expect(acts).toHaveLength(2)
      expect(acts[0].name).toBe('Act 1')
      expect(acts[1].name).toBe('Act 2')
    })

    it('assigns order to acts', () => {
      const acts = defaultActs(3)
      expect(acts[0].order).toBe(1)
      expect(acts[1].order).toBe(2)
      expect(acts[2].order).toBe(3)
    })
  })

  describe('isLegacyConfig', () => {
    it('returns true for string array scenes', () => {
      const config = { scenes: ['Act 1, Scene 1', 'Opening'] }
      expect(isLegacyConfig(config)).toBe(true)
    })

    it('returns false for structured scenes', () => {
      const config = {
        acts: [{ id: 'act-1', name: 'Act 1', order: 1 }],
        scenes: [{ id: 'scn-1', name: 'Scene 1', actId: 'act-1', order: 1 }]
      }
      expect(isLegacyConfig(config)).toBe(false)
    })

    it('returns false for null/undefined config', () => {
      expect(isLegacyConfig(null)).toBe(false)
      expect(isLegacyConfig(undefined)).toBe(false)
    })

    it('returns false for empty scenes with acts', () => {
      const config = { acts: [], scenes: [] }
      expect(isLegacyConfig(config)).toBe(false)
    })
  })

  describe('migrateConfig', () => {
    it('migrates legacy config to new format', () => {
      const legacy = { scenes: ['Act 1, Scene 1', 'Act 1, Scene 2', 'Act 2, Scene 1'] }
      const migrated = migrateConfig(legacy)

      expect(migrated.acts).toBeDefined()
      expect(migrated.acts.length).toBeGreaterThanOrEqual(2)
      expect(migrated.scenes[0]).toHaveProperty('id')
      expect(migrated.scenes[0]).toHaveProperty('actId')
    })

    it('assigns scenes to correct acts', () => {
      const legacy = { scenes: ['Act 1, Scene 1', 'Act 2, Scene 1'] }
      const migrated = migrateConfig(legacy)

      const act1 = migrated.acts.find(a => a.name === 'Act 1')
      const act2 = migrated.acts.find(a => a.name === 'Act 2')
      const scene1 = migrated.scenes.find(s => s.name === 'Act 1, Scene 1')
      const scene2 = migrated.scenes.find(s => s.name === 'Act 2, Scene 1')

      expect(scene1.actId).toBe(act1.id)
      expect(scene2.actId).toBe(act2.id)
    })

    it('handles unassigned scenes (no act pattern)', () => {
      const legacy = { scenes: ['Opening Number', 'Bows'] }
      const migrated = migrateConfig(legacy)

      expect(migrated.scenes[0].actId).toBeNull()
      expect(migrated.scenes[1].actId).toBeNull()
    })

    it('is idempotent for already migrated config', () => {
      const migrated = {
        acts: [{ id: 'act-1', name: 'Act 1', order: 1 }],
        scenes: [{ id: 'scn-1', name: 'Scene 1', actId: 'act-1', order: 1 }]
      }
      const result = migrateConfig(migrated)
      expect(result).toEqual(migrated)
    })

    it('handles empty legacy config', () => {
      const legacy = { scenes: [] }
      const migrated = migrateConfig(legacy)
      expect(migrated.acts).toHaveLength(2) // Default 2 acts
      expect(migrated.scenes).toHaveLength(0)
    })
  })

  describe('migrateNote', () => {
    const migratedConfig = {
      acts: [{ id: 'act-1', name: 'Act 1', order: 1 }],
      scenes: [{ id: 'scn-1', name: 'Act 1, Scene 1', actId: 'act-1', order: 1 }]
    }

    it('adds sceneId and actId for matching scene', () => {
      const note = { scene: 'Act 1, Scene 1', text: 'Test' }
      const migrated = migrateNote(note, migratedConfig)

      expect(migrated.sceneId).toBe('scn-1')
      expect(migrated.actId).toBe('act-1')
    })

    it('leaves already migrated notes unchanged', () => {
      const note = { sceneId: 'scn-1', actId: 'act-1', text: 'Test' }
      const migrated = migrateNote(note, migratedConfig)
      expect(migrated).toEqual(note)
    })

    it('sets null IDs for unmatched scenes', () => {
      const note = { scene: 'Unknown Scene', text: 'Test' }
      const migrated = migrateNote(note, migratedConfig)
      expect(migrated.sceneId).toBeNull()
    })
  })

  describe('findAct / findScene', () => {
    const acts = [{ id: 'act-1', name: 'Act 1' }, { id: 'act-2', name: 'Act 2' }]
    const scenes = [{ id: 'scn-1', name: 'Scene 1' }, { id: 'scn-2', name: 'Scene 2' }]

    it('finds act by ID', () => {
      expect(findAct(acts, 'act-1')).toEqual(acts[0])
    })

    it('returns null for unknown act ID', () => {
      expect(findAct(acts, 'unknown')).toBeNull()
    })

    it('finds scene by ID', () => {
      expect(findScene(scenes, 'scn-2')).toEqual(scenes[1])
    })

    it('returns null for unknown scene ID', () => {
      expect(findScene(scenes, 'unknown')).toBeNull()
    })
  })

  describe('formatActScene', () => {
    it('formats act and scene', () => {
      expect(formatActScene({ name: 'Act 1' }, { name: 'Scene 2' })).toBe('Act 1 · Scene 2')
    })

    it('returns only act name when no scene', () => {
      expect(formatActScene({ name: 'Act 1' }, null)).toBe('Act 1')
    })

    it('returns only scene name when no act', () => {
      expect(formatActScene(null, { name: 'Opening' })).toBe('Opening')
    })

    it('returns empty string when both null', () => {
      expect(formatActScene(null, null)).toBe('')
    })
  })

  describe('groupScenesByAct', () => {
    const acts = [
      { id: 'act-1', name: 'Act 1', order: 1 },
      { id: 'act-2', name: 'Act 2', order: 2 }
    ]
    const scenes = [
      { id: 'scn-1', name: 'Scene 1', actId: 'act-1', order: 1 },
      { id: 'scn-2', name: 'Scene 2', actId: 'act-1', order: 2 },
      { id: 'scn-3', name: 'Scene 3', actId: 'act-2', order: 1 },
      { id: 'scn-4', name: 'Opening', actId: null, order: 0 }
    ]

    it('groups scenes by act', () => {
      const groups = groupScenesByAct(acts, scenes)

      expect(groups[0].act.id).toBe('act-1')
      expect(groups[0].scenes).toHaveLength(2)
      expect(groups[1].act.id).toBe('act-2')
      expect(groups[1].scenes).toHaveLength(1)
    })

    it('includes unassigned scenes bucket', () => {
      const groups = groupScenesByAct(acts, scenes)
      const unassigned = groups.find(g => g.act === null)

      expect(unassigned).toBeDefined()
      expect(unassigned.scenes).toHaveLength(1)
      expect(unassigned.scenes[0].id).toBe('scn-4')
    })

    it('sorts acts by order', () => {
      const groups = groupScenesByAct(acts, scenes)
      expect(groups[0].act.order).toBe(1)
      expect(groups[1].act.order).toBe(2)
    })
  })

  describe('act mutations', () => {
    const acts = [
      { id: 'act-1', name: 'Act 1', order: 1 },
      { id: 'act-2', name: 'Act 2', order: 2 }
    ]

    it('addAct creates new act with next order', () => {
      const newActs = addAct(acts, 'Act 3')
      expect(newActs).toHaveLength(3)
      expect(newActs[2].name).toBe('Act 3')
      expect(newActs[2].order).toBe(3)
    })

    it('renameAct updates act name', () => {
      const newActs = renameAct(acts, 'act-1', 'Prologue')
      expect(newActs[0].name).toBe('Prologue')
    })

    it('removeAct removes act and unassigns its scenes', () => {
      const scenes = [{ id: 'scn-1', actId: 'act-1' }]
      const { acts: newActs, scenes: newScenes } = removeAct(acts, scenes, 'act-1')

      expect(newActs).toHaveLength(1)
      expect(newScenes[0].actId).toBeNull()
    })

    it('reorderActs updates order', () => {
      const newActs = reorderActs(acts, ['act-2', 'act-1'])
      expect(newActs[0].id).toBe('act-2')
      expect(newActs[0].order).toBe(1)
      expect(newActs[1].id).toBe('act-1')
      expect(newActs[1].order).toBe(2)
    })
  })

  describe('scene mutations', () => {
    const scenes = [
      { id: 'scn-1', name: 'Scene 1', actId: 'act-1', order: 1 }
    ]

    it('addScene creates new scene', () => {
      const newScenes = addScene(scenes, 'Scene 2', 'act-1')
      expect(newScenes).toHaveLength(2)
      expect(newScenes[1].name).toBe('Scene 2')
      expect(newScenes[1].actId).toBe('act-1')
    })

    it('renameScene updates scene name', () => {
      const newScenes = renameScene(scenes, 'scn-1', 'Opening')
      expect(newScenes[0].name).toBe('Opening')
    })

    it('removeScene removes scene and reorders', () => {
      const allScenes = [
        { id: 'scn-1', name: 'Scene 1', order: 1 },
        { id: 'scn-2', name: 'Scene 2', order: 2 }
      ]
      const newScenes = removeScene(allScenes, 'scn-1')

      expect(newScenes).toHaveLength(1)
      expect(newScenes[0].order).toBe(1)
    })

    it('moveSceneToAct changes actId', () => {
      const newScenes = moveSceneToAct(scenes, 'scn-1', 'act-2')
      expect(newScenes[0].actId).toBe('act-2')
    })
  })

  describe('resolveActTag', () => {
    const acts = [
      { id: 'act-1', name: 'Act 1', order: 1 },
      { id: 'act-2', name: 'Act 2', order: 2 }
    ]

    it('resolves #a1 to first act', () => {
      expect(resolveActTag('#a1', acts)).toEqual(acts[0])
    })

    it('resolves #act2 to second act', () => {
      expect(resolveActTag('#act2', acts)).toEqual(acts[1])
    })

    it('returns null for invalid tag', () => {
      expect(resolveActTag('#blocking', acts)).toBeNull()
    })

    it('returns null for out of range', () => {
      expect(resolveActTag('#a99', acts)).toBeNull()
    })
  })

  describe('compatibility helpers', () => {
    it('sceneNames extracts names from both formats', () => {
      expect(sceneNames(['Scene 1', 'Scene 2'])).toEqual(['Scene 1', 'Scene 2'])
      expect(sceneNames([{ name: 'Scene 1' }, { name: 'Scene 2' }])).toEqual(['Scene 1', 'Scene 2'])
    })

    it('isStructuredScenes detects format', () => {
      expect(isStructuredScenes(['Scene 1'])).toBe(false)
      expect(isStructuredScenes([{ name: 'Scene 1', id: 'scn-1' }])).toBe(true)
    })

    it('findSceneByName works on both formats', () => {
      expect(findSceneByName(['Scene 1', 'Scene 2'], 'Scene 1')).toBe('Scene 1')
      expect(findSceneByName([{ name: 'Scene 1', id: 'scn-1' }], 'Scene 1')).toEqual({ name: 'Scene 1', id: 'scn-1' })
    })

    it('ensureMigrated handles all cases', () => {
      const legacy = { scenes: ['Act 1, Scene 1'] }
      const migrated = ensureMigrated(legacy)
      expect(migrated.acts).toBeDefined()
      expect(migrated.scenes[0]).toHaveProperty('id')
    })
  })
})
