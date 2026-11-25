'use client'

// The one way a user-facing PDF is opened: a full-screen overlay above every
// card/detail modal. `PdfDocumentView` owns the canvas + action bar (BACK,
// PRINT, SHARE, DOWNLOAD, OPEN), so a PDF can never strand someone outside the
// installed app. Callers pass the route's `?inline=1` URL plus the direct
// `downloadUrl`; see `inlinePdfUrl()` in `lib/pdf-actions.ts`.

import { useEffect, useRef } from 'react'
import { PdfDocumentView } from '@/components/ui/PdfDocumentView'
import { useWorkerImmersive } from '@/components/worker/useWorkerImmersive'

export interface PdfViewerTarget {
  url: string
  downloadUrl: string
  filename: string
  title?: string
  backLabel?: string
  showOpen?: boolean
  showDownload?: boolean
}

interface Props {
  target: PdfViewerTarget | null
  onClose: () => void
}

/** Full-screen in-app PDF viewer. Renders nothing when `target` is null. */
export function PdfViewerModal({ target, onClose }: Props) {
  useWorkerImmersive(Boolean(target))
  // Keep the latest onClose without re-running the effect on every render (an
  // inline arrow would otherwise capture "hidden" as the overflow to restore).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!target) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [target])

  if (!target) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="pdf-viewer-modal"
      className="fixed inset-0 z-[60] flex flex-col bg-black"
    >
      <PdfDocumentView
        url={target.url}
        downloadUrl={target.downloadUrl}
        filename={target.filename}
        title={target.title}
        onBack={onClose}
        backLabel={target.backLabel}
        showOpen={target.showOpen}
        showDownload={target.showDownload}
      />
    </div>
  )
}
