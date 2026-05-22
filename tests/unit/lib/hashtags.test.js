import { describe, it, expect } from 'vitest'
import { parseHashtags, getHashtagSuggestions } from '../../../src/lib/hashtags'

describe('hashtags', () => {
  const characters = ['Alice', 'Bob', 'Charlie', 'Sound Department']
  const scenes = ['Opening Number', 'Act 1, Scene 1', 'Act 1, Scene 2', 'Finale']
  const structuredScenes = [
    { id: 'scn-1', name: 'Opening Number', actId: null, order: 1 },
    { id: 'scn-2', name: 'Act 1, Scene 1', actId: 'act-1', order: 2 },
    { id: 'scn-3', name: 'Act 1, Scene 2', actId: 'act-1', order: 3 },
    { id: 'scn-4', name: 'Finale', actId: 'act-2', order: 4 }
  ]
  const acts = [
    { id: 'act-1', name: 'Act 1', order: 1 },
    { id: 'act-2', name: 'Act 2', order: 2 }
  ]

  describe('parseHashtags', () => {
    describe('category extraction', () => {
      it('extracts blocking category', () => {
        const result = parseHashtags('#blocking Move downstage', characters, scenes)
        expect(result.category).toBe('blocking')
      })

      it('extracts technical category with aliases', () => {
        expect(parseHashtags('#tech Fix cue', characters, scenes).category).toBe('technical')
        expect(parseHashtags('#lights Adjust spot', characters, scenes).category).toBe('technical')
        expect(parseHashtags('#sound Check mic', characters, scenes).category).toBe('technical')
      })

      it('extracts costume category', () => {
        const result = parseHashtags('#costume Quick change needed', characters, scenes)
        expect(result.category).toBe('costume')
      })

      it('extracts multiple categories', () => {
        const result = parseHashtags('#blocking #props Move chair', characters, scenes)
        expect(result.category).toBe('blocking, set')
      })
    })

    describe('priority extraction', () => {
      it('extracts high priority', () => {
        expect(parseHashtags('#high Important note', characters, scenes).priority).toBe('high')
        expect(parseHashtags('#urgent Fix now', characters, scenes).priority).toBe('high')
        expect(parseHashtags('#critical Safety issue', characters, scenes).priority).toBe('high')
      })

      it('extracts low priority', () => {
        expect(parseHashtags('#low Minor fix', characters, scenes).priority).toBe('low')
        expect(parseHashtags('#minor Small tweak', characters, scenes).priority).toBe('low')
      })
    })

    describe('cast extraction', () => {
      it('extracts cast from @mention', () => {
        const result = parseHashtags('@alice Check blocking', characters, scenes)
        expect(result.cast).toBe('Alice')
      })

      it('extracts cast from #tag', () => {
        const result = parseHashtags('#bob Check entrance', characters, scenes)
        expect(result.cast).toBe('Bob')
      })

      it('extracts multiple cast members', () => {
        const result = parseHashtags('@alice @bob Duet timing', characters, scenes)
        expect(result.cast).toBe('Alice, Bob')
      })

      it('fuzzy matches cast names', () => {
        const result = parseHashtags('#char Check costume', characters, scenes)
        expect(result.cast).toBe('Charlie')
      })

      it('adds department tags to cast for routing', () => {
        const result = parseHashtags('#sound #lights Check levels', characters, scenes)
        expect(result.cast).toContain('sound')
        expect(result.cast).toContain('lights')
      })
    })

    describe('scene extraction', () => {
      it('extracts scene from hashtag', () => {
        const result = parseHashtags('#opening Fix entrance', characters, scenes)
        expect(result.scene).toBe('Opening Number')
      })

      it('fuzzy matches scene names', () => {
        const result = parseHashtags('#finale Add bow', characters, scenes)
        expect(result.scene).toBe('Finale')
      })

      it('extracts sceneId and actId with structured scenes', () => {
        const result = parseHashtags('#finale Test note', characters, structuredScenes, acts)
        expect(result.scene).toBe('Finale')
        expect(result.sceneId).toBe('scn-4')
        expect(result.actId).toBe('act-2')
      })
    })

    describe('act extraction', () => {
      it('extracts act from #a1 tag', () => {
        const result = parseHashtags('#a1 Check props', characters, structuredScenes, acts)
        expect(result.actId).toBe('act-1')
      })

      it('extracts act from #act1 tag', () => {
        const result = parseHashtags('#act2 Finale notes', characters, structuredScenes, acts)
        expect(result.actId).toBe('act-2')
      })
    })

    describe('text cleaning', () => {
      it('removes recognized tags from text', () => {
        const result = parseHashtags('#blocking #high Move downstage', characters, scenes)
        expect(result.cleanText).toBe('Move downstage')
      })

      it('preserves unrecognized tags', () => {
        const result = parseHashtags('#blocking #custom Move downstage', characters, scenes)
        expect(result.cleanText).toContain('#custom')
      })

      it('cleans up double spaces', () => {
        const result = parseHashtags('#blocking   Move   downstage', characters, scenes)
        expect(result.cleanText).toBe('Move downstage')
      })
    })

    describe('edge cases', () => {
      it('handles empty text', () => {
        const result = parseHashtags('', characters, scenes)
        expect(result.cleanText).toBe('')
        expect(result.category).toBeNull()
      })

      it('handles text without tags', () => {
        const result = parseHashtags('Just plain text', characters, scenes)
        expect(result.cleanText).toBe('Just plain text')
        expect(result.tags).toHaveLength(0)
      })

      it('handles empty character and scene lists', () => {
        const result = parseHashtags('#blocking @alice', [], [])
        expect(result.category).toBe('blocking')
        expect(result.cast).toBeNull() // No match in empty list
      })
    })
  })

  describe('getHashtagSuggestions', () => {
    it('returns empty for text without tag prefix', () => {
      expect(getHashtagSuggestions('Hello world', characters, scenes)).toEqual([])
    })

    it('suggests categories starting with partial', () => {
      const suggestions = getHashtagSuggestions('Note #bl', characters, scenes)
      expect(suggestions).toContain('#blocking')
    })

    it('suggests priorities starting with partial', () => {
      const suggestions = getHashtagSuggestions('Note #hi', characters, scenes)
      expect(suggestions).toContain('#high')
    })

    it('suggests cast members for @mentions', () => {
      const suggestions = getHashtagSuggestions('Note @a', characters, scenes)
      expect(suggestions.some(s => s.toLowerCase().includes('alice'))).toBe(true)
    })

    it('suggests scenes for partial match', () => {
      const suggestions = getHashtagSuggestions('Note #open', characters, scenes)
      expect(suggestions.some(s => s.includes('opening'))).toBe(true)
    })

    it('suggests act tags when acts are provided', () => {
      const suggestions = getHashtagSuggestions('Note #a', characters, structuredScenes, acts)
      expect(suggestions).toContain('#a1')
      expect(suggestions).toContain('#a2')
    })

    it('limits suggestions to 6 items', () => {
      const suggestions = getHashtagSuggestions('Note #', characters, scenes)
      expect(suggestions.length).toBeLessThanOrEqual(6)
    })

    it('handles empty partial after @', () => {
      const suggestions = getHashtagSuggestions('Note @', characters, scenes)
      expect(suggestions.length).toBeGreaterThan(0)
    })
  })
})
