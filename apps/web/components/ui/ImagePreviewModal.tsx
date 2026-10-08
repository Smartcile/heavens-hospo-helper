'use client'

// The popup you get when clicking an image in a picker (or the guide reader):
// the picture large, with its annotation layer drawn on top, plus the actions —
// ANNOTATE (admin), REMOVE LAYER, BROWSE LIBRARY, REMOVE IMAGE.

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AnnotatedImage } from '@/components/ui/AnnotatedImage'
import { ImageAnnotator } from '@/components/ui/ImageAnnotator'
import { annotationIsEmpty, emptyAnnotation, type AnnotationData } from '@/lib/image-annotations'

export function ImagePreviewModal({
  imageUrl,
  usageKey,
  canEdit,
  annotation,
  onClose,
  onRemove,
  onBrowseLibrary,
  onAnnotationSaved,
}: {
  imageUrl: string
  /** The usage this image belongs to — annotations are stored per usage. */
  usageKey?: string
  /** ADMIN only: managers and workers see annotated images but cannot edit. */
  canEdit: boolean
  annotation: AnnotationData | null
  onClose: () => void
  onRemove?: () => void
  onBrowseLibrary?: () => void
  onAnnotationSaved?: (data: AnnotationData) => void
}) {
  const [mode, setMode] = useState<'preview' | 'annotate'>('preview')
  const [current, setCurrent] = useState<AnnotationData | null>(annotation)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // A different image always starts at the preview. The layer arriving async
  // must not yank the user out of the annotator, so mode resets only on URL.
  useEffect(() => {
    setMode('preview')
    setError('')
  }, [imageUrl])

  useEffect(() => {
    setCurrent(annotation)
  }, [annotation])

  async function persist(data: AnnotationData): Promise<boolean> {
    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/admin/image-annotations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usageKey, imageUrl, data }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        setError(d?.error ?? 'SAVE FAILED')
        return false
      }
      setCurrent(annotationIsEmpty(data) ? null : data)
      onAnnotationSaved?.(data)
      return true
    } catch {
      setError('SAVE FAILED')
      return false
    } finally {
      setSaving(false)
    }
  }

  const canAnnotate = canEdit && !!usageKey
  const hasLayer = !!current && !annotationIsEmpty(current)

  return (
    <Modal isOpen onClose={onClose} title="IMAGE" size="xl">
      {mode === 'annotate' ? (
        <ImageAnnotator
          src={imageUrl}
          initial={current}
          saving={saving}
          onCancel={() => setMode('preview')}
          onSave={async (data) => { if (await persist(data)) setMode('preview') }}
        />
      ) : (
        <div className="space-y-3">
          <AnnotatedImage
            src={imageUrl}
            alt=""
            annotations={current}
            className="mx-auto block"
            imgClassName="mx-auto max-h-[55vh] w-auto max-w-full border border-grey-mid"
          />
          {error && <p className="font-mono text-xs text-danger text-center">{error}</p>}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {canAnnotate && (
              <Button size="sm" onClick={() => { setError(''); setMode('annotate') }}>
                {hasLayer ? '✎ EDIT LAYER' : '✎ ANNOTATE'}
              </Button>
            )}
            {canAnnotate && hasLayer && (
              <Button size="sm" variant="ghost" loading={saving} onClick={() => persist(emptyAnnotation())}>
                REMOVE LAYER
              </Button>
            )}
            {canEdit && onBrowseLibrary && (
              <Button size="sm" variant="ghost" onClick={onBrowseLibrary}>BROWSE LIBRARY</Button>
            )}
            {onRemove && (
              <Button size="sm" variant="ghost" onClick={() => { onRemove(); onClose() }}>REMOVE IMAGE</Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>CLOSE</Button>
          </div>
          {canEdit && usageKey && (
            <p className="text-center font-mono text-xs text-grey-light/70">
              ANNOTATIONS SAVE AS A SEPARATE LAYER — THE PHOTO ITSELF IS NEVER CHANGED.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
