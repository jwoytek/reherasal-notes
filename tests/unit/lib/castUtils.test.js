import { describe, it, expect } from 'vitest'
import {
  castName,
  castEmails,
  castMembers,
  isGroup,
  castNameList,
  normalizeCast,
  getEmailsForCast,
  expandedCastList,
  getNotesForUser,
  getVisibleNotesForUser,
  FULL_ACCESS_ROLES
} from '../../../src/lib/castUtils'

describe('castUtils', () => {
  describe('castName', () => {
    it('returns string entries as-is', () => {
      expect(castName('Alice')).toBe('Alice')
    })

    it('returns name from object entries', () => {
      expect(castName({ name: 'Bob', emails: ['bob@test.com'] })).toBe('Bob')
    })

    it('returns empty string for objects without name', () => {
      expect(castName({ emails: ['test@test.com'] })).toBe('')
    })
  })

  describe('castEmails', () => {
    it('returns empty array for string entries', () => {
      expect(castEmails('Alice')).toEqual([])
    })

    it('returns emails from object entries', () => {
      expect(castEmails({ name: 'Bob', emails: ['bob@test.com'] })).toEqual(['bob@test.com'])
    })

    it('returns empty array when no emails', () => {
      expect(castEmails({ name: 'Charlie' })).toEqual([])
    })
  })

  describe('castMembers', () => {
    it('returns empty array for string entries', () => {
      expect(castMembers('Alice')).toEqual([])
    })

    it('returns members from group entries', () => {
      expect(castMembers({ name: 'Ensemble', members: ['Alice', 'Bob'] })).toEqual(['Alice', 'Bob'])
    })
  })

  describe('isGroup', () => {
    it('returns false for string entries', () => {
      expect(isGroup('Alice')).toBe(false)
    })

    it('returns true when isGroup flag is set', () => {
      expect(isGroup({ name: 'Ensemble', isGroup: true })).toBe(true)
    })

    it('returns true when members array exists', () => {
      expect(isGroup({ name: 'Ensemble', members: ['Alice'] })).toBe(true)
    })

    it('returns false for individual cast objects', () => {
      expect(isGroup({ name: 'Alice', emails: ['alice@test.com'] })).toBeFalsy()
    })
  })

  describe('castNameList', () => {
    it('extracts names from mixed array', () => {
      const cast = ['Alice', { name: 'Bob' }, { name: 'Charlie', isGroup: true }]
      expect(castNameList(cast)).toEqual(['Alice', 'Bob', 'Charlie'])
    })

    it('filters out empty names', () => {
      const cast = ['Alice', { name: '' }, 'Bob']
      expect(castNameList(cast)).toEqual(['Alice', 'Bob'])
    })
  })

  describe('normalizeCast', () => {
    it('converts string entries to full objects', () => {
      const result = normalizeCast(['Alice', 'Bob'])
      expect(result[0]).toMatchObject({
        name: 'Alice',
        emails: [],
        members: [],
        isGroup: false
      })
    })

    it('preserves object entry fields', () => {
      const result = normalizeCast([{ name: 'Alice', emails: ['alice@test.com'], isGroup: false }])
      expect(result[0]).toMatchObject({
        name: 'Alice',
        emails: ['alice@test.com'],
        isGroup: false
      })
    })

    it('handles non-array input', () => {
      expect(normalizeCast(null)).toEqual([])
      expect(normalizeCast(undefined)).toEqual([])
    })

    it('filters out entries without names', () => {
      const result = normalizeCast([{ name: '' }, 'Alice'])
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Alice')
    })
  })

  describe('getEmailsForCast', () => {
    const cast = [
      { name: 'Alice', emails: ['alice@test.com'] },
      { name: 'Bob', emails: ['bob@test.com'] },
      { name: 'Ensemble', isGroup: true, members: ['Alice', 'Bob'], emails: ['ensemble@test.com'] }
    ]

    it('returns direct emails for individual cast', () => {
      expect(getEmailsForCast('Alice', cast)).toEqual(['alice@test.com'])
    })

    it('returns group and member emails for groups', () => {
      const emails = getEmailsForCast('Ensemble', cast)
      expect(emails).toContain('ensemble@test.com')
      expect(emails).toContain('alice@test.com')
      expect(emails).toContain('bob@test.com')
    })

    it('deduplicates emails', () => {
      const emails = getEmailsForCast('Ensemble', cast)
      const uniqueEmails = [...new Set(emails)]
      expect(emails).toHaveLength(uniqueEmails.length)
    })

    it('returns empty array for unknown cast', () => {
      expect(getEmailsForCast('Unknown', cast)).toEqual([])
    })
  })

  describe('expandedCastList', () => {
    it('expands group members', () => {
      const cast = [
        { name: 'Alice', isGroup: false },
        { name: 'Ensemble', isGroup: true, members: ['Bob', 'Charlie'] }
      ]
      const expanded = expandedCastList(cast)

      expect(expanded).toHaveLength(3)
      expect(expanded.find(c => c.name === 'Alice')).toMatchObject({ name: 'Alice', group: null })
      expect(expanded.find(c => c.name === 'Bob')).toMatchObject({ name: 'Bob', group: 'Ensemble' })
      expect(expanded.find(c => c.name === 'Charlie')).toMatchObject({ name: 'Charlie', group: 'Ensemble' })
    })

    it('handles string entries', () => {
      const expanded = expandedCastList(['Alice', 'Bob'])
      expect(expanded).toHaveLength(2)
      expect(expanded[0]).toMatchObject({ name: 'Alice', group: null })
    })
  })

  describe('getNotesForUser', () => {
    const notes = [
      { id: '1', text: 'General note', cast: '', resolved: false },
      { id: '2', text: 'Alice note', cast: 'Alice', resolved: false },
      { id: '3', text: 'Sound note', cast: 'sound', resolved: false },
      { id: '4', text: 'Resolved note', cast: 'Alice', resolved: true },
      { id: '5', text: '@bob check this', cast: '', resolved: false }
    ]

    it('returns all unresolved notes for admin', () => {
      const session = { name: 'Admin', staffRole: 'Admin', role: 'admin' }
      const result = getNotesForUser(notes, session)
      expect(result).toHaveLength(4) // All unresolved
      expect(result.find(n => n.id === '4')).toBeUndefined() // Resolved excluded
    })

    it('returns all unresolved notes for Stage Manager', () => {
      const session = { name: 'Jane', staffRole: 'Stage Manager', role: 'member' }
      const result = getNotesForUser(notes, session)
      expect(result).toHaveLength(4)
    })

    it('filters notes for non-full-access roles', () => {
      const session = { name: 'Bob', staffRole: 'Lighting', role: 'shared' }
      const result = getNotesForUser(notes, session)
      // Should match the @bob mention
      expect(result.some(n => n.id === '5')).toBe(true)
    })

    it('matches notes by cast field', () => {
      const session = { name: 'Alice', staffRole: 'Cast', role: 'shared' }
      const result = getNotesForUser(notes, session)
      expect(result.some(n => n.id === '2')).toBe(true)
    })

    it('matches notes by staffRole in cast field', () => {
      const session = { name: 'John', staffRole: 'Sound', role: 'shared' }
      const result = getNotesForUser(notes, session)
      expect(result.some(n => n.id === '3')).toBe(true)
    })

    it('handles null/undefined inputs', () => {
      expect(getNotesForUser(null, { name: 'Test' })).toEqual([])
      expect(getNotesForUser(notes, null)).toEqual(notes)
    })
  })

  describe('getVisibleNotesForUser', () => {
    const notes = [
      { id: '1', text: 'General note', resolved: false },
      { id: '2', text: 'Resolved note', resolved: true }
    ]

    it('returns all notes including resolved for full access', () => {
      const session = { staffRole: 'Stage Manager', role: 'member' }
      const result = getVisibleNotesForUser(notes, session)
      expect(result).toHaveLength(2)
    })
  })

  describe('FULL_ACCESS_ROLES', () => {
    it('includes expected roles', () => {
      expect(FULL_ACCESS_ROLES).toContain('Stage Manager')
      expect(FULL_ACCESS_ROLES).toContain('Director')
    })
  })
})
