'use client'

// Excalidraw-lite annotator: draw freehand, lines, arrows, boxes and text on
// top of an image. The strokes are stored as pure data (fractions of the image
// box), NOT baked into the picture — the layer can be re-edited or removed and
// the image underneath is never touched.
//
// SELECT lets you click an annotation, drag it around (clamped to the image)
// and delete it — the move is one undo step.

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { AnnotationShapes } from '@/components/ui/AnnotatedImage'
import {
  annotationIsEmpty,
  clamp01Value,
  emptyAnnotation,
  hitTestAnnotation,
  normaliseAnnotation,
  removeAnnotation,
  translateAnnotation,
  ANNOTATION_COLOURS,
  ANNOTATION_WIDTHS,
  DEFAULT_ANNOTATION_SIZE,
  DEFAULT_ANNOTATION_WIDTH,
  type AnnotationData,
  type AnnotationPoint,
  type AnnotationSelection,
  type AnnotationShape,
  type AnnotationTool,
} from '@/lib/image-annotations'

type Tool = AnnotationTool | 'text' | 'select'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'SELECT' },
  { id: 'pen', label: 'PEN' },
  { id: 'line', label: 'LINE' },
  { id: 'arrow', label: 'ARROW' },
  { id: 'box', label: 'BOX' },
  { id: 'text', label: 'TEXT' },
]

export function ImageAnnotator({
  src,
  initial,
  saving,
  onCancel,
  onSave,
}: {
  src: string
  initial?: AnnotationData | null
  saving?: boolean
  onCancel: () => void
  onSave: (data: AnnotationData) => void
}) {
  const [tool, setTool] = useState<Tool>('pen')
  const [colour, setColour] = useState<string>(ANNOTATION_COLOURS[0])
  const [width, setWidth] = useState<number>(DEFAULT_ANNOTATION_WIDTH)
  const [data, setData] = useState<AnnotationData>(() => normaliseAnnotation(initial))
  const [history, setHistory] = useState<AnnotationData[]>([])
  const [draft, setDraft] = useState<AnnotationShape | null>(null)
  const [textAt, setTextAt] = useState<AnnotationPoint | null>(null)
  const [textValue, setTextValue] = useState('')
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 1000, h: 1000 })
  const [selected, setSelected] = useState<AnnotationSelection | null>(null)
  const [dragging, setDragging] = useState(false)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef(false)
  const moveRef = useRef<{ sel: AnnotationSelection; start: AnnotationPoint; origin: AnnotationData; moved: boolean } | null>(null)

  function commit(next: AnnotationData) {
    setHistory((h) => [...h.slice(-49), data])
    setData(next)
    setSelected(null)
  }

  function undo() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory(history.slice(0, -1))
    setData(prev)
    setSelected(null)
  }

  // Delete the selected annotation (Delete / Backspace). Ignored while typing.
  useEffect(() => {
    if (!selected) return
    const sel = selected
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      e.preventDefault()
      commit(removeAnnotation(data, sel))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, data]) // eslint-disable-line react-hooks/exhaustive-deps

  function pointFrom(e: { clientX: number; clientY: number }): AnnotationPoint | null {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp01Value((e.clientX - rect.left) / rect.width),
      y: clamp01Value((e.clientY - rect.top) / rect.height),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Clicking into the text input must not reset it — the input lives on the
    // surface, so its pointer events bubble here.
    if ((e.target as HTMLElement).closest?.('input, textarea')) return
    const p = pointFrom(e)
    if (!p) return

    if (tool === 'select') {
      const hit = hitTestAnnotation(data, p, dims.w, dims.h)
      setSelected(hit)
      if (hit) {
        moveRef.current = { sel: hit, start: p, origin: data, moved: false }
        setDragging(true)
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      return
    }

    if (tool === 'text') {
      setSelected(null)
      setTextAt(p)
      setTextValue('')
      return
    }

    setSelected(null)
    drawingRef.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDraft(
      tool === 'pen'
        ? { tool: 'pen', color: colour, width, points: [p] }
        : { tool, color: colour, width, points: [p, p] },
    )
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const move = moveRef.current
    if (move) {
      const p = pointFrom(e)
      if (!p) return
      const dx = (p.x - move.start.x) * dims.w
      const dy = (p.y - move.start.y) * dims.h
      if (!move.moved && Math.hypot(dx, dy) > 2) move.moved = true
      if (move.moved) setData(translateAnnotation(move.origin, move.sel, dx, dy, dims.w, dims.h))
      return
    }

    if (!drawingRef.current || !draft) return
    const p = pointFrom(e)
    if (!p) return
    if (draft.tool === 'pen') {
      const last = draft.points[draft.points.length - 1]
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.002) return
      setDraft({ ...draft, points: [...draft.points, p] })
    } else {
      setDraft({ ...draft, points: [draft.points[0], p] })
    }
  }

  function onPointerUp() {
    const move = moveRef.current
    if (move) {
      moveRef.current = null
      setDragging(false)
      if (move.moved) setHistory((h) => [...h.slice(-49), move.origin])
      return
    }

    if (!drawingRef.current || !draft) return
    drawingRef.current = false
    const valid =
      draft.tool === 'pen'
        ? draft.points.length >= 2
        : draft.points[0].x !== draft.points[1].x || draft.points[0].y !== draft.points[1].y
    if (valid) commit({ ...data, shapes: [...data.shapes, draft] })
    setDraft(null)
  }

  function commitText() {
    const text = textValue.trim()
    if (textAt && text) {
      commit({
        ...data,
        texts: [...data.texts, { x: textAt.x, y: textAt.y, text, color: colour, size: Math.max(DEFAULT_ANNOTATION_SIZE, width * 5) }],
      })
    }
    setTextAt(null)
    setTextValue('')
  }

  const hasData = !annotationIsEmpty(data)

  return (
    <div className="space-y-3">
      {/* Tools */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTool(t.id); setTextAt(null); setSelected(null) }}
              className={cn(
                'font-mono text-xs uppercase px-2 py-1.5 border border-grey-mid -ml-px first:ml-0 transition-colors',
                tool === t.id ? 'bg-white text-black border-white' : 'text-grey-light hover:text-white',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {ANNOTATION_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColour(c)}
              aria-label={`Colour ${c}`}
              title={c}
              className={cn('h-5 w-5 border transition-transform', colour === c ? 'border-white scale-110' : 'border-grey-mid')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex items-center">
          {ANNOTATION_WIDTHS.map((w, i) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              aria-label={`Width ${i + 1}`}
              title={`WIDTH ${i + 1}`}
              className={cn(
                'h-7 w-7 border border-grey-mid -ml-px first:ml-0 font-mono text-xs transition-colors',
                width === w ? 'bg-white text-black border-white' : 'text-grey-light hover:text-white',
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {selected && (
            <button
              type="button"
              onClick={() => commit(removeAnnotation(data, selected))}
              className="font-mono text-xs uppercase border border-danger/60 px-2 py-1.5 text-danger hover:bg-danger hover:text-black transition-colors"
            >
              DELETE
            </button>
          )}
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:text-white hover:border-white transition-colors disabled:opacity-40 disabled:hover:text-grey-light"
          >
            UNDO
          </button>
          <button
            type="button"
            onClick={() => hasData && commit(emptyAnnotation())}
            disabled={!hasData}
            className="font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 text-grey-light hover:text-danger hover:border-danger transition-colors disabled:opacity-40 disabled:hover:text-grey-light"
          >
            CLEAR
          </button>
        </div>
      </div>

      {/* Drawing surface */}
      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          'relative select-none touch-none border border-grey-mid bg-black/40',
          tool === 'text' ? 'cursor-text' : tool === 'select' ? (dragging ? 'cursor-grabbing' : 'cursor-default') : 'cursor-crosshair',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const el = e.currentTarget
            if (el.naturalWidth > 0 && el.naturalHeight > 0) setDims({ w: el.naturalWidth, h: el.naturalHeight })
          }}
          className="pointer-events-none block h-auto w-full"
        />
        <AnnotationShapes data={data} draft={draft} selection={selected} width={dims.w} height={dims.h} />
        {textAt && (
          <div className="absolute" style={{ left: `${textAt.x * 100}%`, top: `${textAt.y * 100}%` }}>
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                // Keep Escape for this input (cancel the label, not the popup).
                e.stopPropagation()
                if (e.key === 'Enter') commitText()
                if (e.key === 'Escape') { setTextAt(null); setTextValue('') }
              }}
              onBlur={commitText}
              placeholder="TYPE..."
              className="field w-48"
              style={{ color: colour }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-grey-light flex-1 min-w-[14rem]">
          SELECT TAP → DRAG TO MOVE · DELETE KEY REMOVES. THE LAYER SAVES SEPARATELY — CLEAR + SAVE REMOVES THE LAYER.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>CANCEL</Button>
          <Button onClick={() => onSave(data)} loading={saving}>SAVE LAYER</Button>
        </div>
      </div>
    </div>
  )
}
