import { useState } from 'react'
import NoteCard from './NoteCard'
import { api } from '../lib/api'

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'blocking', label: 'Blocking' },
  { value: 'performance', label: 'Performance' },
  { value: 'music', label: 'Music / vocals' },
  { value: 'technical', label: 'Technical' },
  { value: 'costume', label: 'Costume' },
  { value: 'set', label: 'Set / props' },
  { value: 'choreography', label: 'Choreography' },
  { value: 'orchestra', label: 'Orchestra' },
]

export default function ByCastTab({ notes, sheetId, scenes, scenesStruct = [], acts = [], characters, loading, onNoteUpdated, onNoteDeleted }) {
  const [filterMode, setFilterMode] = useState('cast') // cast | department
  const [selectedCast, setSelectedCast] = useState([])
  const [selectedDepts, setSelectedDepts] = useState([])
  const [showResolved, setShowResolved] = useState(false)

  if (loading) return <div className="empty">Loading notes…</div>
  if (!notes.length) return <div className="empty">No notes yet — log some from the first tab.</div>

  function resolveAll(ns) {
    ns.filter(n => !n.resolved).forEach(n => {
      onNoteUpdated({ ...n, resolved: true })
      api.updateNote(sheetId, n.id, { resolved: true }).catch(e => console.warn('Sync failed:', e.message))
    })
  }

  function toggleCast(name) {
    setSelectedCast(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name])
  }

  function toggleDept(val) {
    setSelectedDepts(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val])
  }

  // Build cast list from notes (handles comma-separated multi-cast)
  const allCastInNotes = [...new Set(
    notes.flatMap(n => n.cast ? n.cast.split(',').map(s => s.trim()).filter(Boolean) : ['(no cast member)'])
  )].sort()

  // Build dept list from notes
  const allDeptsInNotes = [...new Set(
    notes.flatMap(n => n.category ? n.category.split(',').map(s => s.trim()).filter(Boolean) : ['general'])
  )].sort()

  // Filter notes
  const filteredNotes = notes.filter(n => {
    if (!showResolved && n.resolved) return false
    if (filterMode === 'cast' && selectedCast.length > 0) {
      const noteCast = n.cast ? n.cast.split(',').map(s => s.trim()) : ['(no cast member)']
      return selectedCast.some(c => noteCast.includes(c))
    }
    if (filterMode === 'department' && selectedDepts.length > 0) {
      const noteCats = n.category ? n.category.split(',').map(s => s.trim()) : ['general']
      return selectedDepts.some(d => noteCats.includes(d))
    }
    return true
  })

  // Group filtered notes
  function groupNotes() {
    const groups = {}
    filteredNotes.forEach(n => {
      let keys = []
      if (filterMode === 'cast') {
        keys = n.cast ? n.cast.split(',').map(s => s.trim()).filter(Boolean) : ['(no cast member)']
      } else {
        keys = n.category ? n.category.split(',').map(s => s.trim()).filter(Boolean) : ['general']
        // Map to readable labels
        keys = keys.map(k => CATEGORIES.find(c => c.value === k)?.label || k)
      }
      keys.forEach(key => {
        if (!groups[key]) groups[key] = []
        if (!groups[key].find(x => x.id === n.id)) groups[key].push(n)
      })
    })
    return groups
  }

  const groups = groupNotes()

  return (
    <div>
      {/* Filter mode toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['cast', '🎭 By cast'], ['department', '🏷 By department']].map(([mode, label]) => (
          <button key={mode} onClick={() => { setFilterMode(mode); setSelectedCast([]); setSelectedDepts([]) }}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 20, cursor: 'pointer', fontWeight: filterMode === mode ? 700 : 400,
              background: filterMode === mode ? 'var(--accent, #6d28d9)' : 'var(--bg2)',
              color: filterMode === mode ? 'white' : 'var(--text2)',
              border: `0.5px solid ${filterMode === mode ? 'transparent' : 'var(--border)'}` }}>
            {label}
          </button>
        ))}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
          Show resolved
        </label>
      </div>

      {/* Cast filter pills */}
      {filterMode === 'cast' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          <button onClick={() => setSelectedCast([])}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: selectedCast.length === 0 ? 700 : 400,
              background: selectedCast.length === 0 ? 'var(--accent, #6d28d9)' : 'var(--bg2)',
              color: selectedCast.length === 0 ? 'white' : 'var(--text2)',
              border: `0.5px solid ${selectedCast.length === 0 ? 'transparent' : 'var(--border)'}` }}>
            All
          </button>
          {allCastInNotes.map(name => (
            <button key={name} onClick={() => toggleCast(name)}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: selectedCast.includes(name) ? 700 : 400,
                background: selectedCast.includes(name) ? 'var(--purple-bg)' : 'var(--bg2)',
                color: selectedCast.includes(name) ? 'var(--purple-text)' : 'var(--text2)',
                border: `0.5px solid ${selectedCast.includes(name) ? 'var(--purple-text)' : 'var(--border)'}` }}>
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Department filter pills */}
      {filterMode === 'department' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
          <button onClick={() => setSelectedDepts([])}
            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: selectedDepts.length === 0 ? 700 : 400,
              background: selectedDepts.length === 0 ? 'var(--accent, #6d28d9)' : 'var(--bg2)',
              color: selectedDepts.length === 0 ? 'white' : 'var(--text2)',
              border: `0.5px solid ${selectedDepts.length === 0 ? 'transparent' : 'var(--border)'}` }}>
            All
          </button>
          {CATEGORIES.filter(c => allDeptsInNotes.includes(c.value)).map(({ value, label }) => (
            <button key={value} onClick={() => toggleDept(value)}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, cursor: 'pointer', fontWeight: selectedDepts.includes(value) ? 700 : 400,
                background: selectedDepts.includes(value) ? 'var(--purple-bg)' : 'var(--bg2)',
                color: selectedDepts.includes(value) ? 'var(--purple-text)' : 'var(--text2)',
                border: `0.5px solid ${selectedDepts.includes(value) ? 'var(--purple-text)' : 'var(--border)'}` }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}>
        {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
        {(selectedCast.length > 0 || selectedDepts.length > 0) && ' matching filter'}
        {' · '}{filteredNotes.filter(n => !n.resolved).length} open
      </p>

      {/* Grouped results */}
      {Object.entries(groups)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, ns]) => {
          const open = ns.filter(n => !n.resolved).length
          return (
            <div key={name} style={{ marginBottom: '1.5rem' }}>
              <div className="section-label">
                {name}
                <span style={{ fontWeight: 400, marginLeft: 8 }}>
                  {open} open · {ns.length} total
                  {open > 0 && (
                    <button className="btn btn-sm" style={{ marginLeft: 8, fontSize: 11, padding: '2px 8px' }}
                      onClick={() => resolveAll(ns)}>Resolve all</button>
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ns.map(n => (
                  <NoteCard key={n.id} note={n} sheetId={sheetId} scenes={scenes} scenesStruct={scenesStruct} acts={acts}
                    characters={characters} onUpdated={onNoteUpdated} onDeleted={onNoteDeleted} />
                ))}
              </div>
            </div>
          )
        })}

      {filteredNotes.length === 0 && (
        <div className="empty">No notes match the current filter.</div>
      )}
    </div>
  )
}
