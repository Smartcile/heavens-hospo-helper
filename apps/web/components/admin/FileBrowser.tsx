'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { FileUsage } from '@/lib/file-usage'

// File manager (Settings → FILES, admin-only). Tree over the server's
// storage root (UPLOAD_PATH volume):
//   UPLOADS — MEDIA  = every uploaded file (photos, gift-card PDFs, templates)
//   BACKUPS           = the backups/ folder for kept archive files
// Click a file to preview it in a popup with its usage tags. A file that is
// still linked somewhere cannot be deleted (server-enforced).

interface FileEntry {
  name: string
  dir: boolean
  size: number
  mtime: string
}

interface PreviewFile {
  root: string
  path: string
  name: string
}

const ROOTS = [
  { key: 'media', label: 'UPLOADS — MEDIA', hint: 'EVERY FILE THE APP HAS SAVED (PHOTOS, GIFT-CARD PDFS, TEMPLATES)' },
  { key: 'backups', label: 'BACKUPS', hint: 'STORED BACKUP ARCHIVES — KEEP DATABASE DUMPS HERE' },
] as const

const SHORT_KIND: Record<string, string> = {
  template: 'TEMPLATE',
  'gift-card': 'CARD',
  staff: 'PHOTO',
  completion: 'PHOTO',
  'training-step': 'LEGACY',
  'guide-step': 'GUIDE',
  inventory: 'INVENTORY',
  menu: 'MENU',
  'woo-image': 'WOO',
}

const PREVIEW_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'pdf'])

const dirKey = (root: string, path: string) => `${root}:${path}`

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

/** Summarise usages into short chips: [{ text: 'CARD', count: 2 }, …]. */
function chipSummary(usages: FileUsage[]): { text: string; count: number }[] {
  const byKind = new Map<string, number>()
  for (const u of usages) byKind.set(u.kind, (byKind.get(u.kind) ?? 0) + 1)
  return [...byKind.entries()].map(([kind, count]) => ({
    text: SHORT_KIND[kind] ?? kind.toUpperCase(),
    count,
  }))
}

export function FileBrowser() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([dirKey('media', '')]))
  const [cache, setCache] = useState<Record<string, FileEntry[]>>({})
  const [usage, setUsage] = useState<Record<string, Record<string, FileUsage[]>>>({})
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<PreviewFile | null>(null)
  const seqRef = useRef(0)

  const listDir = useCallback(async (root: string, path: string) => {
    const key = dirKey(root, path)
    setLoading((prev) => new Set(prev).add(key))
    setError('')
    try {
      const r = await fetch(`/api/admin/files?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`)
      if (!r.ok) { setError(`COULD NOT LIST ${root}/${path}`); return }
      const data = await r.json()
      const entries: FileEntry[] = data.entries ?? []
      setCache((prev) => ({ ...prev, [key]: entries }))
      // Usage tags for every file in this folder (one round trip).
      const files = entries.filter((e) => !e.dir).map((e) => e.name)
      if (files.length === 0) { setUsage((prev) => ({ ...prev, [key]: {} })); return }
      const names = files.map((n) => `name=${encodeURIComponent(n)}`).join('&')
      const u = await fetch(`/api/admin/files/usage?root=${encodeURIComponent(root)}&dir=${encodeURIComponent(path)}&${names}`)
      if (u.ok) {
        const d = await u.json()
        setUsage((prev) => ({ ...prev, [key]: d.usagesByFile ?? {} }))
      }
    } catch {
      setError(`COULD NOT LIST ${root}/${path}`)
    } finally {
      setLoading((prev) => {
        const next = new Set(prev)
        next.delete(dirKey(root, path))
        return next
      })
    }
  }, [])

  // Initial pass over whatever is expanded at mount.
  useEffect(() => {
    for (const key of expanded) {
      const idx = key.indexOf(':')
      const root = key.slice(0, idx)
      const path = key.slice(idx + 1)
      if (cache[dirKey(root, path)] === undefined) listDir(root, path)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function removeFromList(file: PreviewFile) {
    const parentPath = file.path.split('/').slice(0, -1).join('/')
    const key = dirKey(file.root, parentPath)
    setCache((prev) => {
      const list = prev[key]
      if (!list) return prev
      return { ...prev, [key]: list.filter((e) => e.name !== file.name) }
    })
    setUsage((prev) => {
      const dir = prev[key]
      if (!dir) return prev
      const next = { ...dir }
      delete next[file.name]
      return { ...prev, [key]: next }
    })
    setPreview(null)
  }

  function toggle(root: string, path: string) {
    const key = dirKey(root, path)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key); return next }
      next.add(key)
      return next
    })
    if (cache[key] === undefined) listDir(root, path)
  }

  async function refresh() {
    seqRef.current += 1
    setError('')
    setUsage({})
    setCache({})
    for (const key of expanded) {
      const idx = key.indexOf(':')
      const root = key.slice(0, idx)
      const path = key.slice(idx + 1)
      await listDir(root, path)
    }
  }

  function renderDir(root: string, relPath: string, entry?: FileEntry, depth = 0) {
    const key = dirKey(root, relPath)
    const isRoot = !entry
    const isOpen = expanded.has(key)
    const entries = cache[key]
    const isLoading = loading.has(key)
    const pad = 8 + depth * 16

    return (
      <div key={key}>
        <button
          onClick={() => toggle(root, relPath)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1 text-left font-mono text-[11px] uppercase tracking-wider transition-colors',
            isRoot ? 'text-white' : 'text-grey-light hover:text-white',
          )}
          style={{ paddingLeft: `${pad}px` }}
        >
          <span className="text-grey-light w-3 shrink-0">{isLoading ? '…' : isOpen ? '▾' : '▸'}</span>
          <span className="truncate">{isRoot ? (ROOTS.find((r) => r.key === root)?.label ?? root) : entry!.name}</span>
          <span className="ml-auto font-mono text-[9px] text-grey-light/70 shrink-0">
            {isLoading ? 'LOADING' : isOpen && entries ? `${entries.length} ITEM${entries.length === 1 ? '' : 'S'}` : ''}
          </span>
        </button>

        {isOpen && (
          <div className="border-l border-grey-mid ml-2.5">
            {isLoading && !entries && (
              <p className="font-mono text-[10px] text-grey-light px-3 py-1" style={{ paddingLeft: `${16 + depth * 16}px` }}>LOADING...</p>
            )}
            {entries && entries.length === 0 && (
              <p className="font-mono text-[10px] text-grey-light/60 px-3 py-1" style={{ paddingLeft: `${16 + depth * 16}px` }}>
                {root === 'backups' && relPath === ''
                  ? 'NO STORED ARCHIVES — USE BACKUP & RESTORE ABOVE TO DOWNLOAD ONE'
                  : 'EMPTY'}
              </p>
            )}
    {entries?.map((e) =>
      e.dir
        ? renderDir(root, relPath ? `${relPath}/${e.name}` : e.name, e, depth + 1)
        : renderFile(root, relPath, e, depth + 1),
    )}
          </div>
        )}
      </div>
    )
  }

  // `dirRel` is the directory this file lives in ('' = root of the tree root).
  function renderFile(root: string, dirRel: string, entry: FileEntry, depth: number) {
    const parentKey = dirKey(root, dirRel)
    const usages = usage[parentKey]?.[entry.name] ?? []
    const chips = chipSummary(usages)
    const fullPath = dirRel ? `${dirRel}/${entry.name}` : entry.name
    const pad = 8 + depth * 16

    return (
      <button
        key={dirKey(root, fullPath)}
        onClick={() => setPreview({ root, path: fullPath, name: entry.name })}
        title="CLICK TO PREVIEW"
        className="w-full flex items-center gap-2 px-2 py-1 hover:bg-grey-dark/40 text-left transition-colors"
        style={{ paddingLeft: `${pad}px` }}
      >
        <span className="w-3 shrink-0" />
        <span className="font-sans text-xs text-white truncate min-w-0">{entry.name}</span>
        {chips.map((c) => (
          <span
            key={c.text}
            className={cn(
              'font-mono text-[9px] uppercase border px-1 py-0.5 shrink-0',
              c.text === 'PHOTO' || c.text === 'LEGACY' || c.text === 'GUIDE' || c.text === 'INVENTORY' || c.text === 'MENU'
                ? 'border-[#60A5FA]/60 text-[#60A5FA]'
                : 'border-[#FACC15]/60 text-[#FACC15]',
            )}
          >
            {c.text}{c.count > 1 ? ` ×${c.count}` : ''}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className="font-mono text-[9px] text-grey-light/70">{formatSize(entry.size)}</span>
          <span className="font-mono text-[9px] text-grey-light/70">{String(entry.mtime).slice(0, 10)}</span>
          <span className="font-mono text-[9px] text-grey-light/60">▸</span>
        </span>
      </button>
    )
  }

  return (
    <div>
      <div className="border border-grey-mid">
        <div className="px-3 py-2 border-b border-grey-mid flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-grey-light">
            CLICK A FOLDER TO OPEN IT — CLICK A FILE TO PREVIEW IT
          </span>
          <button
            onClick={refresh}
            className="font-mono text-[10px] uppercase border border-grey-mid px-2 py-1 text-grey-light hover:text-white hover:border-white transition-colors"
          >
            ↻ REFRESH
          </button>
        </div>
        <div className="p-1 max-h-[55vh] overflow-y-auto">
          {ROOTS.map((r) => (
            <div key={r.key}>
              {renderDir(r.key, '')}
              <p className="font-mono text-[9px] text-grey-light/50 px-2 pb-1" style={{ paddingLeft: '26px' }}>{r.hint}</p>
            </div>
          ))}
        </div>
      </div>
      {error && <p className="mt-2 font-mono text-[10px] text-danger">{error}</p>}

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} onDeleted={removeFromList} />}
    </div>
  )
}

// ── Preview popup ────────────────────────────────────────────────────────

function FilePreviewModal({ file, onClose, onDeleted }: { file: PreviewFile; onClose: () => void; onDeleted: (f: PreviewFile) => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [usages, setUsages] = useState<FileUsage[]>([])
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const ext = extOf(file.name)
  const previewable = PREVIEW_EXTS.has(ext)
  const image = previewable && ext !== 'pdf'

  useEffect(() => {
    let active = true
    setPreviewUrl(null)
    setPreviewFailed(false)
    fetch(`/api/admin/files/usage?root=${encodeURIComponent(file.root)}&path=${encodeURIComponent(file.path)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { if (active) setUsages((d as { usages?: FileUsage[] }).usages ?? []) })
      .catch(() => {})
    if (previewable) {
      fetch(`/api/admin/files/download?root=${encodeURIComponent(file.root)}&path=${encodeURIComponent(file.path)}&inline=1`)
        .then((r) => (r.ok ? r.blob() : null))
        .then((blob) => {
          if (!active || !blob) return
          setPreviewUrl(URL.createObjectURL(blob))
        })
        .catch(() => { if (active) setPreviewFailed(true) })
    }
    return () => { active = false }
  }, [file.root, file.path, file.name, previewable])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const linked = usages.length > 0
  const downloadHref = `/api/admin/files/download?root=${encodeURIComponent(file.root)}&path=${encodeURIComponent(file.path)}`
  const openHref = `${downloadHref}&inline=1`

  async function deleteFile() {
    setDeleting(true)
    setDeleteError('')
    if (!window.confirm(`DELETE "${file.name}"?\n\nTHIS PERMANENTLY REMOVES THE FILE FROM THE SERVER.`)) { setDeleting(false); return }
    const r = await fetch(`/api/admin/files?root=${encodeURIComponent(file.root)}&path=${encodeURIComponent(file.path)}`, { method: 'DELETE' })
    if (r.ok) {
      onDeleted(file)
    } else {
      const d = await r.json().catch(() => null)
      setDeleteError(d?.error ?? 'DELETE FAILED')
    }
    setDeleting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="border border-grey-mid bg-grey-dark p-5 w-full max-w-3xl space-y-3 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-sm uppercase tracking-widest text-white truncate">{file.name}</h2>
          <span className="font-mono text-[10px] uppercase text-grey-light shrink-0">{(file.root === 'media' ? 'UPLOADS — MEDIA' : 'BACKUPS')}</span>
        </div>

        {/* Usage tags */}
        <div className="border border-grey-mid p-2.5 space-y-1.5">
          <p className="font-mono text-[10px] uppercase text-grey-light tracking-wider">WHERE IT&apos;S USED</p>
          {usages.length === 0 ? (
            <p className="font-mono text-[10px] text-success">NOT LINKED ANYWHERE — FREE TO DELETE</p>
          ) : (
            <div className="space-y-1">
              {usages.map((u) => (
                <div key={`${u.kind}-${u.id}`} className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[9px] uppercase border border-[#FACC15]/60 text-[#FACC15] px-1 py-0.5 shrink-0">{u.label}</span>
                  <span className="font-mono text-xs text-white truncate">{u.ref || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="border border-grey-mid flex-1 min-h-[300px] bg-black flex items-center justify-center overflow-auto">
          {previewUrl && image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={file.name} className="max-w-full max-h-[45vh] object-contain" />
          ) : previewUrl && ext === 'pdf' ? (
            <iframe src={previewUrl} title={file.name} className="w-full h-[45vh] bg-white" />
          ) : (
            <p className="font-mono text-[10px] uppercase text-grey-light p-4">
              {previewable ? 'LOADING PREVIEW...' : 'NO EMBEDDED PREVIEW FOR THIS FILE TYPE — USE DOWNLOAD'}
            </p>
          )}
        </div>

        {deleteError && <p className="font-mono text-[10px] text-danger">{deleteError}</p>}

        <div className="border-t border-grey-mid pt-3 flex items-center gap-2 flex-wrap">
          {previewable && (
            <a href={openHref} target="_blank" rel="noreferrer" className="font-mono font-semibold uppercase tracking-wider transition-colors inline-flex items-center gap-2 bg-white text-black border border-white hover:bg-accent hover:border-accent text-xs px-3 py-1.5">OPEN</a>
          )}
          <a href={downloadHref} className="font-mono font-semibold uppercase tracking-wider transition-colors inline-flex items-center gap-2 bg-transparent text-white border border-grey-mid hover:border-white text-xs px-3 py-1.5">DOWNLOAD</a>
          <button
            onClick={deleteFile}
            disabled={linked || deleting}
            title={linked ? 'LINKED — CANNOT DELETE' : 'DELETE FILE'}
            className="font-mono font-semibold uppercase tracking-wider transition-colors inline-flex items-center gap-2 bg-transparent text-danger border border-danger hover:bg-danger hover:text-black text-xs px-3 py-1.5 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-danger"
          >
            {deleting ? 'DELETING' : 'DELETE'}
          </button>
          <button onClick={onClose} className="ml-auto font-mono text-[10px] uppercase text-grey-light hover:text-white px-2 py-1">CLOSE</button>
        </div>
      </div>
    </div>
  )
}
