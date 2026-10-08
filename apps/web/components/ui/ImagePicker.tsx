'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useIsAdmin } from '@/lib/use-is-admin'
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal'
import { MediaLibraryModal } from '@/components/ui/MediaLibraryModal'
import { annotationIsEmpty, type AnnotationData } from '@/lib/image-annotations'

// Image upload with CHOOSE + PASTE (CTRL+V) and a media library. Clicking the
// thumbnail opens a popup: view large, annotate (ADMIN — a removable drawing /
// text layer saved separately from the file), browse existing images, remove.
// Used for every single-image field across the app.

interface ImagePickerProps {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
  className?: string
  disabled?: boolean
  /** Upload endpoint — admin by default; the worker editor passes /api/worker/upload. */
  endpoint?: string
  /** Where this image lives, e.g. `menu-item:<id>`. Enables annotation layers. */
  usageKey?: string
}

export function ImagePicker({ value, onChange, label, className, disabled, endpoint = '/api/admin/upload', usageKey }: ImagePickerProps) {
  const isAdmin = useIsAdmin()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [annotation, setAnnotation] = useState<AnnotationData | null>(null)

  useEffect(() => {
    let alive = true
    setAnnotation(null)
    if (!isAdmin || !usageKey || !value) return () => { alive = false }
    fetch(`/api/admin/image-annotations?usageKey=${encodeURIComponent(usageKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        if (!alive || !Array.isArray(rows)) return
        const row = rows.find((x: { imageUrl?: string }) => x.imageUrl === value)
        setAnnotation(row ? (row.data as AnnotationData) : null)
      })
      .catch(() => { /* no layer */ })
    return () => { alive = false }
  }, [isAdmin, usageKey, value])

  async function upload(file: File) {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(endpoint, { method: 'POST', body: form })
      if (r.ok) {
        const data = await r.json()
        if (data?.url) onChange(data.url)
        else setError('UPLOAD FAILED')
      } else {
        const d = await r.json().catch(() => null)
        setError(d?.error ?? 'UPLOAD FAILED')
      }
    } catch {
      setError('UPLOAD FAILED')
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (disabled) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const file = it.getAsFile()
        if (file) {
          e.preventDefault()
          upload(file)
          return
        }
      }
    }
  }

  const hasLayer = !!annotation && !annotationIsEmpty(annotation)

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)} onPaste={handlePaste}>
      {label && (
        <span className="font-mono text-xs uppercase text-grey-light tracking-wider">{label}</span>
      )}
      {value ? (
        <button type="button" onClick={() => setPreviewOpen(true)} title="OPEN" className="relative shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="uploaded preview"
            className="block h-10 w-10 border border-grey-mid object-cover transition-colors hover:border-white"
          />
          {hasLayer && (
            <span className="absolute -bottom-1 -right-1 border border-gold bg-black/70 px-0.5 font-mono text-2xs leading-tight text-gold">✎</span>
          )}
        </button>
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        <label className={cn(
          'cursor-pointer font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 transition-colors',
          disabled ? 'opacity-40 cursor-not-allowed' : 'text-grey-light hover:text-white hover:border-white',
        )}>
          {uploading ? 'UPLOADING...' : value ? 'REPLACE IMAGE' : 'ADD IMAGE'}
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) upload(f)
            }}
          />
        </label>
        {isAdmin && !disabled && (
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light transition-colors hover:border-white hover:text-white"
          >
            LIBRARY
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors"
          >
            REMOVE
          </button>
        )}
        {!disabled && (
          <span className="font-mono text-xs text-grey-light/50 hidden sm:inline">OR PASTE (CTRL+V)</span>
        )}
      </div>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}

      {previewOpen && value && (
        <ImagePreviewModal
          imageUrl={value}
          usageKey={usageKey}
          canEdit={isAdmin}
          annotation={annotation}
          onClose={() => setPreviewOpen(false)}
          onRemove={() => onChange(null)}
          onBrowseLibrary={isAdmin ? () => { setPreviewOpen(false); setLibraryOpen(true) } : undefined}
          onAnnotationSaved={(data) => setAnnotation(annotationIsEmpty(data) ? null : data)}
        />
      )}
      {libraryOpen && (
        <MediaLibraryModal onClose={() => setLibraryOpen(false)} onPick={(url) => onChange(url)} />
      )}
    </div>
  )
}
