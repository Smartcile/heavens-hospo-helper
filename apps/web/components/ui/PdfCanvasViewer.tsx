'use client'

// Minimal PDF viewer for the gift-card previews: no browser chrome, just the
// pages — scroll to move, ctrl/⌘ + wheel or pinch to zoom, double-tap to toggle
// fit/2×, drag to pan. pdf.js renders to canvases; the worker is served from
// /pdf.worker.min.mjs (copied into public by scripts/copy-pdf-worker.mjs on
// prebuild/predev).

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import {
  clampScale,
  pinchScale,
  toggleZoom,
  zoomAroundPoint,
  type Point,
} from '@/lib/pdf-zoom'

interface Props {
  url: string
  title?: string
}

const DEFAULT_SCALE = 1.4

// Remember the last zoom level per document. A gift card is opened, closed and
// reopened from a modal/stack in the same session, so keeping the scale here
// means the "zoom + share" flow does not start over each time.
const scaleByUrl = new Map<string, number>()

function savedScale(url: string): number {
  // Client-only: the module map is per browser session, never shared across
  // server renders (and SSR must start at the default for a hydration match).
  if (typeof window === 'undefined') return DEFAULT_SCALE
  const stored = scaleByUrl.get(url)
  return stored != null ? clampScale(stored) : DEFAULT_SCALE
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

interface PointerState {
  x: number
  y: number
}

interface PinchState {
  startDistance: number
  startScale: number
  anchor: Point
  startScrollLeft: number
  startScrollTop: number
}

interface TapState {
  x: number
  y: number
  moved: boolean
}

export function PdfCanvasViewer({ url, title }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<PDFDocumentProxy | null>(null)
  const dragRef = useRef<{ px: number; py: number; left: number; top: number } | null>(null)
  const pointersRef = useRef<Map<number, PointerState>>(new Map())
  const pinchRef = useRef<PinchState | null>(null)
  const tapRef = useRef<TapState | null>(null)
  const lastTapRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null)
  const scaleRef = useRef(savedScale(url))
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [scale, setScale] = useState(() => savedScale(url))
  const [pinching, setPinching] = useState(false)
  scaleRef.current = scale

  const applyZoom = useCallback(
    (nextScale: number, anchor?: Point) => {
      const el = containerRef.current
      const prev = scaleRef.current
      const next = clampScale(nextScale)
      if (next === prev) {
        scaleRef.current = next
        setScale(next)
        return
      }
      if (el) {
        pendingScrollRef.current = anchor
          ? zoomAroundPoint(prev, next, anchor, { left: el.scrollLeft, top: el.scrollTop })
          : { left: el.scrollLeft, top: el.scrollTop }
      }
      scaleRef.current = next
      scaleByUrl.set(url, next)
      setScale(next)
    },
    [url],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      pendingScrollRef.current = null
      const initial = savedScale(url)
      scaleRef.current = initial
      setScale(initial)
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

  // Render every page at the current scale. Re-runs on zoom; the scroll offset
  // captured by the gesture (or the one in view) is restored once the resized
  // canvases are in the DOM so zooming does not jump back to the top-left.
  useEffect(() => {
    if (status !== 'ready' || !docRef.current) return
    const doc = docRef.current
    const host = pagesRef.current
    const container = containerRef.current
    if (!host) return
    let cancelled = false
    const startScroll = container
      ? { left: container.scrollLeft, top: container.scrollTop }
      : { left: 0, top: 0 }

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
      if (cancelled || !container) return
      const target = pendingScrollRef.current ?? startScroll
      pendingScrollRef.current = null
      container.scrollLeft = target.left
      container.scrollTop = target.top
    }
    render()
    return () => { cancelled = true }
  }, [status, scale])

  // Native wheel listener so ctrl+wheel can preventDefault (React's onWheel is
  // passive at the root in some browsers, which breaks zoom). Zoom around the
  // cursor so the point under the pointer stays put.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el!.getBoundingClientRect()
      applyZoom(scaleRef.current * (e.deltaY < 0 ? 1.12 : 0.89), {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom])

  // While two fingers are down, stop the browser panning/pinch-zooming the page
  // underneath the canvas. A single finger still scrolls the document via
  // `touch-action: pan-x pan-y` (see the container style below).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length > 1) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  function capture(target: HTMLElement, pointerId: number) {
    if (typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(pointerId)
      } catch {
        /* pointer already gone */
      }
    }
  }

  function release(target: HTMLElement, pointerId: number) {
    if (typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(pointerId)) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* pointer already gone */
      }
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (status !== 'ready' || e.button !== 0) return
    const el = containerRef.current
    if (!el) return
    capture(e.currentTarget, e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values())
      const rect = el.getBoundingClientRect()
      const midX = (a.x + b.x) / 2 - rect.left
      const midY = (a.y + b.y) / 2 - rect.top
      pinchRef.current = {
        startDistance: distance(a, b),
        startScale: scaleRef.current,
        anchor: { x: midX, y: midY },
        startScrollLeft: el.scrollLeft,
        startScrollTop: el.scrollTop,
      }
      tapRef.current = null
      lastTapRef.current = null
      dragRef.current = null
      setPinching(true)
      return
    }

    if (pointersRef.current.size === 1) {
      tapRef.current = { x: e.clientX, y: e.clientY, moved: false }
      // Touch uses native scrolling (touch-action), so only mouse/pen drags pan.
      if (e.pointerType !== 'touch') {
        dragRef.current = { px: e.clientX, py: e.clientY, left: el.scrollLeft, top: el.scrollTop }
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = containerRef.current
    const pointer = pointersRef.current.get(e.pointerId)
    if (pointer) {
      pointer.x = e.clientX
      pointer.y = e.clientY
    }

    const tap = tapRef.current
    if (tap && distance({ x: tap.x, y: tap.y }, { x: e.clientX, y: e.clientY }) > 8) {
      tap.moved = true
    }

    const pinch = pinchRef.current
    if (pinch) {
      const points = Array.from(pointersRef.current.values())
      if (points.length < 2) return
      const next = pinchScale(pinch.startScale, pinch.startDistance, distance(points[0], points[1]))
      if (next === scaleRef.current) return
      pendingScrollRef.current = zoomAroundPoint(
        pinch.startScale,
        next,
        pinch.anchor,
        { left: pinch.startScrollLeft, top: pinch.startScrollTop },
      )
      scaleRef.current = next
      scaleByUrl.set(url, next)
      setScale(next)
      return
    }

    const drag = dragRef.current
    if (!drag || !el) return
    el.scrollLeft = drag.left - (e.clientX - drag.px)
    el.scrollTop = drag.top - (e.clientY - drag.py)
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const endedPinch = Boolean(pinchRef.current)
    pointersRef.current.delete(e.pointerId)
    release(e.currentTarget, e.pointerId)

    if (pinchRef.current && pointersRef.current.size < 2) {
      pinchRef.current = null
      setPinching(false)
    }
    if (pointersRef.current.size === 1) {
      dragRef.current = null
    }

    const tap = tapRef.current
    tapRef.current = null
    if (e.type !== 'pointercancel' && tap && !tap.moved && !endedPinch && pointersRef.current.size === 0) {
      handleTap(e.clientX, e.clientY)
    }
    dragRef.current = null
  }

  function handleTap(x: number, y: number) {
    const el = containerRef.current
    const last = lastTapRef.current
    const now = Date.now()
    if (last && now - last.t < 300 && Math.abs(x - last.x) < 30 && Math.abs(y - last.y) < 30) {
      lastTapRef.current = null
      if (el) {
        const rect = el.getBoundingClientRect()
        applyZoom(toggleZoom(scaleRef.current), { x: x - rect.left, y: y - rect.top })
      }
      return
    }
    lastTapRef.current = { x, y, t: now }
  }

  return (
    <div
      ref={containerRef}
      role="document"
      aria-label={title ?? 'PDF preview'}
      title={title}
      data-pdf-src={url}
      data-scale={scale}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative flex-1 min-h-0 overflow-auto bg-grey-mid/20 cursor-grab active:cursor-grabbing"
      style={{ touchAction: pinching ? 'none' : 'pan-x pan-y' }}
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
          PINCH OR DOUBLE-TAP TO ZOOM · DRAG TO PAN
        </div>
      )}
    </div>
  )
}
