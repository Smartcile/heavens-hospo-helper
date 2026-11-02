'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { moveItem } from '@/lib/array'
import { nearestIndex } from '@/lib/reorder'
import { useIsAdmin } from '@/lib/use-is-admin'
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal'
import { MediaLibraryModal } from '@/components/ui/MediaLibraryModal'
import { annotationIsEmpty, type AnnotationData } from '@/lib/image-annotations'
import { thumbUrl } from '@/lib/image-thumb'

// Multiple-image upload with CHOOSE (multi-select) + PASTE (CTRL+V),
// drag-to-reorder thumbnails, a click-to-open preview popup (annotate / browse
// library / remove) and a media library for reusing existing images.
//
// Ordering works on desktop AND touch: a mouse can drag the whole tile, while
// touch drags the ⠿ grip (which carries `touch-action: none`, so swiping the
// grip reorders instead of scrolling the page). A tap / click that doesn't
// move opens the popup instead.

interface MultiImagePickerProps {
  value: string[]
  onChange: (urls: string[]) => void
  label?: string
  className?: string
  disabled?: boolean
  /** Upload endpoint — admin by default; the worker editor passes /api/worker/upload. */
  endpoint?: string
  /** Where these images live, e.g. `guide-step:<id>`. Enables annotation layers. */
  usageKey?: string
}

export function MultiImagePicker({ value, onChange, label, className, disabled, endpoint = '/api/admin/upload', usageKey }: MultiImagePickerProps) {
  const isAdmin = useIsAdmin()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [annotations, setAnnotations] = useState<Record<string, AnnotationData>>({})
  const itemRefs = useRef<Array<HTMLDivElement | null>>([])
  const downRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let alive = true
    setAnnotations({})
    if (!isAdmin || !usageKey) return () => { alive = false }
    fetch(`/api/admin/image-annotations?usageKey=${encodeURIComponent(usageKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => {
        if (!alive || !Array.isArray(rows)) return
        const map: Record<string, AnnotationData> = {}
        for (const r of rows as { imageUrl: string; data: AnnotationData }[]) map[r.imageUrl] = r.data
        setAnnotations(map)
      })
      .catch(() => { /* no layers */ })
    return () => { alive = false }
  }, [isAdmin, usageKey])

  async function uploadFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    setUploading(true)
    setError('')
    const urls: string[] = []
    try {
      for (const file of images) {
        const form = new FormData()
        form.append('file', file)
        const r = await fetch(endpoint, { method: 'POST', body: form })
        if (r.ok) {
          const data = await r.json()
          if (data?.url) urls.push(data.url)
        } else {
          const d = await r.json().catch(() => null)
          setError(d?.error ?? 'UPLOAD FAILED')
        }
      }
      if (urls.length) onChange([...value, ...urls])
    } catch {
      setError('UPLOAD FAILED')
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (disabled) return
    const files: File[] = []
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const file = it.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length) {
      e.preventDefault()
      uploadFiles(files)
    }
  }

  function startDrag(e: React.PointerEvent, i: number) {
    if (disabled || value.length < 2) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const isGrip = (e.target as HTMLElement)?.dataset?.grip === '1'
    // Touch must use the grip — the tile itself keeps normal touch-action so the
    // page can still be scrolled by swiping over it.
    if (e.pointerType !== 'mouse' && !isGrip) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragIndex(i)
    setOverIndex(i)
  }

  function moveDrag(e: React.PointerEvent) {
    if (dragIndex === null) return
    const rects = itemRefs.current.map((el) => el?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 })
    const idx = nearestIndex(rects, e.clientX, e.clientY)
    if (idx !== null) setOverIndex(idx)
  }

  function endDrag(e: React.PointerEvent, i: number) {
    const start = downRef.current
    downRef.current = null
    const hasCoords = typeof e.clientX === 'number' && typeof e.clientY === 'number'
    const moved = !!start && hasCoords && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5
    const reorder = dragIndex !== null && overIndex !== null && overIndex !== dragIndex
    if (reorder && (moved || !hasCoords)) {
      onChange(moveItem(value, dragIndex, overIndex))
    } else if (!reorder && !moved && !disabled && value[i]) {
      // A click / tap that didn't travel opens the popup.
      setPreviewUrl(value[i])
    }
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <div className={cn('space-y-2', className)} onPaste={handlePaste}>
      {label && <span className="font-mono text-xs uppercase text-grey-light tracking-wider">{label}</span>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((url, i) => (
            <div
              key={url}
              ref={(el) => { itemRefs.current[i] = el }}
              data-index={i}
              onPointerDown={(e) => {
                downRef.current = { x: e.clientX, y: e.clientY }
                startDrag(e, i)
              }}
              onPointerMove={moveDrag}
              onPointerUp={(e) => endDrag(e, i)}
              onPointerCancel={(e) => endDrag(e, i)}
              title={disabled ? undefined : 'CLICK TO OPEN · DRAG TO REORDER'}
              className={cn(
                'relative h-16 w-16 border',
                disabled ? '' : 'cursor-pointer active:cursor-grabbing',
                dragIndex === i
                  ? 'opacity-40 border-white'
                  : overIndex === i && dragIndex !== null
                    ? 'border-white'
                    : 'border-grey-mid',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(url, 192) ?? url} alt={`image ${i + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover pointer-events-none" />
              <span className="absolute bottom-0 left-0 bg-black/70 px-1 font-mono text-xs text-white">{i + 1}</span>
              {annotations[url] && !annotationIsEmpty(annotations[url]) && (
                <span className="absolute bottom-0 right-0 border-l border-t border-gold bg-black/70 px-1 font-mono text-xs leading-tight text-gold">✎</span>
              )}
              {!disabled && value.length > 1 && (
                <span
                  data-grip="1"
                  aria-label={`Reorder image ${i + 1}`}
                  className="absolute top-0 left-0 cursor-grab touch-none bg-black/70 px-1 font-mono text-xs leading-none text-grey-light"
                >
                  ⠿
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                  aria-label={`Remove image ${i + 1}`}
                  className="absolute -top-2 -right-2 h-5 w-5 border border-grey-mid bg-black font-mono text-xs leading-none text-grey-light hover:text-danger"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <label className={cn(
          'cursor-pointer font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 transition-colors',
          disabled ? 'opacity-40 cursor-not-allowed' : 'text-grey-light hover:text-white hover:border-white',
        )}>
          {uploading ? 'UPLOADING...' : '+ ADD IMAGES'}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (files.length) uploadFiles(files)
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
        {!disabled && <span className="font-mono text-xs text-grey-light/50">CLICK TO OPEN · DRAG TO REORDER · OR PASTE (CTRL+V)</span>}
      </div>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}

      {previewUrl && (
        <ImagePreviewModal
          imageUrl={previewUrl}
          usageKey={usageKey}
          canEdit={isAdmin}
          annotation={annotations[previewUrl] ?? null}
          onClose={() => setPreviewUrl(null)}
          onRemove={() => onChange(value.filter((u) => u !== previewUrl))}
          onBrowseLibrary={isAdmin ? () => { setPreviewUrl(null); setLibraryOpen(true) } : undefined}
          onAnnotationSaved={(data) => setAnnotations((prev) => {
            const next = { ...prev }
            if (annotationIsEmpty(data)) delete next[previewUrl]
            else next[previewUrl] = data
            return next
          })}
        />
      )}
      {libraryOpen && (
        <MediaLibraryModal onClose={() => setLibraryOpen(false)} onPick={(url) => onChange([...value, url])} />
      )}
    </div>
  )
}
