import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

const DOC_CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'script', label: 'Script' },
  { value: 'music', label: 'Music / score' },
  { value: 'blocking', label: 'Blocking charts' },
  { value: 'costume', label: 'Costume plots' },
  { value: 'props', label: 'Props list' },
  { value: 'technical', label: 'Technical / lighting' },
  { value: 'marketing', label: 'Marketing' },
]

const CAT_COLORS = {
  script: { bg: 'var(--blue-bg)', text: 'var(--blue-text)' },
  music: { bg: 'var(--teal-bg)', text: 'var(--teal-text)' },
  blocking: { bg: 'var(--amber-bg)', text: 'var(--amber-text)' },
  costume: { bg: 'rgba(212,83,126,0.18)', text: '#ed93b1' },
  props: { bg: 'var(--coral-bg)', text: 'var(--coral-text)' },
  technical: { bg: 'var(--coral-bg)', text: 'var(--coral-text)' },
  marketing: { bg: 'var(--purple-bg)', text: 'var(--purple-text)' },
  general: { bg: 'var(--gray-bg)', text: 'var(--gray-text)' },
}

function fileIcon(mimeType) {
  if (!mimeType) return '📄'
  if (mimeType.includes('pdf')) return '📕'
  if (mimeType.includes('image')) return '🖼'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊'
  if (mimeType.includes('document') || mimeType.includes('word')) return '📝'
  if (mimeType.includes('audio')) return '🎵'
  if (mimeType.includes('video')) return '🎬'
  if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦'
  return '📄'
}

function formatSize(bytes) {
  if (!bytes) return ''
  const n = parseInt(bytes)
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function DocumentsTab({ docsFolderId, attachFolderId, isAdmin }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [uploadCategory, setUploadCategory] = useState('general')
  const [activeFolder, setActiveFolder] = useState('docs') // 'docs' | 'attachments'
  const fileInputRef = useRef(null)

  const activeFolderId = activeFolder === 'docs' ? docsFolderId : attachFolderId

  useEffect(() => {
    const folderId = activeFolder === 'docs' ? docsFolderId : attachFolderId
    if (folderId) loadFiles()
  }, [docsFolderId, attachFolderId, activeFolder])

  async function loadFiles() {
    setLoading(true)
    setError('')
    try {
      const folderId = activeFolder === 'docs' ? docsFolderId : attachFolderId
      const data = await api.getFiles(folderId)
      setFiles(data.files || [])
    } catch (e) {
      setError('Failed to load files: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      // Read file as base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const result = await api.uploadFile({
        folderId: activeFolderId,
        fileName: file.name,
        mimeType: file.type,
        base64Data,
        category: uploadCategory
      })

      setFiles(prev => [{ ...result, createdTime: new Date().toISOString() }, ...prev])
      fileInputRef.current.value = ''
    } catch (e) {
      setError('Upload failed: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  async function deleteFile(fileId) {
    if (!confirm('Delete this file? This cannot be undone.')) return
    try {
      await api.deleteFile(fileId)
      setFiles(prev => prev.filter(f => f.id !== fileId))
    } catch (e) {
      alert('Failed to delete: ' + e.message)
    }
  }

  const filtered = filterCat === 'all' ? files : files.filter(f => f.category === filterCat)

  if (!docsFolderId && !attachFolderId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)' }}>
        <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>No documents folder</p>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>
          This production was created before the documents feature was added. Create a new production to get the full folder structure.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Upload area */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Category</label>
            <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>
              {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUpload}
              style={{ display: 'none' }}
              accept="*/*"
            />
            <button
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : '+ Upload document'}
            </button>
            <button className="btn btn-sm" onClick={loadFiles}>↻</button>
          </div>
        </div>
        {error && <p style={{ fontSize: 13, color: 'var(--red-text)', background: 'var(--red-bg)', padding: '8px 12px', borderRadius: 'var(--radius)', marginTop: 10 }}>{error}</p>}
      </div>

      {/* Category filter */}
      <div className="filter-bar" style={{ marginBottom: '1rem' }}>
        <span className="filter-label">Filter:</span>
        <button className={`filter-pill ${filterCat === 'all' ? 'active' : ''}`} onClick={() => setFilterCat('all')}>All ({files.length})</button>
        {DOC_CATEGORIES.filter(c => files.some(f => f.category === c.value)).map(c => (
          <button key={c.value} className={`filter-pill ${filterCat === c.value ? 'active' : ''}`}
            onClick={() => setFilterCat(c.value)}>
            {c.label} ({files.filter(f => f.category === c.value).length})
          </button>
        ))}
      </div>

      {/* File list */}
      {loading ? (
        <div className="empty">Loading documents…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">{files.length === 0 ? 'No documents uploaded yet.' : 'No documents in this category.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(file => {
            const catStyle = CAT_COLORS[file.category] || CAT_COLORS.general
            const dt = new Date(file.createdTime)
            const dateLabel = dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <div key={file.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{fileIcon(file.mimeType)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{file.name}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, background: catStyle.bg, color: catStyle.text, flexShrink: 0 }}>
                      {DOC_CATEGORIES.find(c => c.value === file.category)?.label || file.category}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                    {formatSize(file.size)}{file.size ? ' · ' : ''}{dateLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <a href={file.webViewLink} target="_blank" rel="noreferrer"
                    className="btn btn-sm" style={{ textDecoration: 'none' }}>
                    View ↗
                  </a>
                  {isAdmin && (
                    <button className="btn btn-sm btn-danger" onClick={() => deleteFile(file.id)}>Delete</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
