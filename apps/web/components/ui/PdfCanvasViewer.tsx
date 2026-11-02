'use client'

// Minimal PDF viewer for the gift-card previews: no browser chrome, just the
// pages — scroll to move, ctrl/⌘ + wheel to zoom, drag to pan. pdf.js renders
// to canvases; the worker is served from /pdf.worker.min.mjs (copied into
// public by scripts/copy-pdf-worker.mjs on prebuild/predev).

import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'

interface Props {
  url: string
  title?: string
}

const MIN_SCALE = 0.4
const MAX_SCALE = 4

export function PdfCanvasViewer({ url, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const dragRef = useRef<{ px: number; py: number; left: number; top: number } | null>(null)
  const scaleRef = useRef(1.4)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [scale, setScale] = useState(1.4)
  scaleRef.current = scale

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument(url).promise
        if (cancelled) {
          doc.destroy()
          return
        }
        docRef.current = doc
        if (containerRef.current) {
          containerRef.current.scrollTop = 0
          containerRef.current.scrollLeft = 0
        }
        setScale(1.4)
        setStatus('ready')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }
    load()
    return () => {
      cancelled = true
      docRef.current?.destroy()
      docRef.current = null
    }
  }, [url])

  // Render every page at the current scale. Re-runs on zoom.
  useEffect(() => {
    if (status !== 'ready' || !docRef.current) return
    const doc = docRef.current
    const host = pagesRef.current
    if (!host) return
    let cancelled = false

    async function render() {
      host!.innerHTML = ''
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        canvas.className = 'block bg-white border border-grey-mid'
        host!.appendChild(canvas)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return
      }
    }
    render()
    return () => { cancelled = true }
  }, [status, scale])

  // Native wheel listener so ctrl+wheel can preventDefault (React's onWheel is
  // passive at the root in some browsers, which breaks zoom).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * (e.deltaY < 0 ? 1.12 : 0.89))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (status !== 'ready' || e.button !== 0) return
    const el = containerRef.current
    if (!el) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { px: e.clientX, py: e.clientY, left: el.scrollLeft, top: el.scrollTop }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const el = containerRef.current
    if (!drag || !el) return
    el.scrollLeft = drag.left - (e.clientX - drag.px)
    el.scrollTop = drag.top - (e.clientY - drag.py)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <div
      ref={containerRef}
      role="document"
      aria-label={title ?? 'PDF preview'}
      title={title}
      data-pdf-src={url}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative flex-1 min-h-0 overflow-auto bg-grey-mid/20 cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      <div ref={pagesRef} className="w-max min-w-full p-2 space-y-2" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="font-mono text-xs text-grey-light loading-cursor">LOADING PDF</p>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="font-mono text-xs uppercase text-grey-light">PREVIEW UNAVAILABLE</p>
        </div>
      )}
      {status === 'ready' && (
        <div className="pointer-events-none absolute bottom-1 right-2 font-mono text-xs text-grey-light/70">
          CTRL+SCROLL ZOOM · DRAG TO PAN
        </div>
      )}
    </div>
  )
}
