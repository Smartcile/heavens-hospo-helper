'use client'

import { useMemo, useRef, useState } from 'react'
import {
  outlineOf,
  normaliseVertices,
  validatePolygon,
  defaultChairSlots,
  chairWorldPlacements,
  ringArea,
  ringPerimeter,
  type Vertex,
  type FurnitureShape,
} from '@/lib/furniture'

/**
 * Draw the real outline of a piece of furniture.
 *
 * Rectangles and circles come from the width/depth boxes; POLYGON lets you
 * click out any shape — an L-booth, a curved banquette, a sofa — and drag the
 * points to adjust. The chair preview is live, because seat count falling out
 * of the shape you drew is the whole point of drawing it.
 */

const PAD = 16

interface Props {
  shape: FurnitureShape
  width: number
  depth: number
  vertices: Vertex[] | null
  seatingDensity: number | null
  maxHeadChairs: number
  gridUnit?: number
  /** Reports the drawn shape back, already normalised to the origin. */
  onChange: (next: { vertices: Vertex[]; width: number; depth: number }) => void
}

export function FurnitureShapeEditor({
  shape,
  width,
  depth,
  vertices,
  seatingDensity,
  maxHeadChairs,
  gridUnit = 5,
  onChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [draft, setDraft] = useState<Vertex[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const isPolygon = shape === 'POLYGON'
  const points = useMemo<Vertex[]>(
    () => (drawing ? draft : (vertices ?? [])),
    [drawing, draft, vertices],
  )

  // Fit the shape into a fixed viewport so a 60cm stool and a 6m banquet run
  // are both legible without the user hunting for a zoom control.
  const view = useMemo(() => {
    const w = Math.max(width, 20)
    const d = Math.max(depth, 20)
    const box = 260
    const scale = Math.min((box - PAD * 2) / w, (box - PAD * 2) / d)
    return { scale, w, d, box }
  }, [width, depth])

  const toScreen = (v: Vertex) => ({ x: PAD + v.x * view.scale, y: PAD + v.y * view.scale })

  const toCm = (clientX: number, clientY: number): Vertex => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    const raw = {
      x: ((clientX - r.left) / r.width) * view.box,
      y: ((clientY - r.top) / r.height) * view.box,
    }
    const snap = (n: number) => Math.round(n / gridUnit) * gridUnit
    return {
      x: snap((raw.x - PAD) / view.scale),
      y: snap((raw.y - PAD) / view.scale),
    }
  }

  const geom = { shape, width, depth, vertices: points.length >= 3 ? points : null }
  const ring = useMemo(() => outlineOf(geom), [shape, width, depth, points])
  const chairs = useMemo(
    () =>
      chairWorldPlacements(
        geom,
        { x: 0, y: 0, rotation: 0 },
        defaultChairSlots(geom, { seatingDensity, maxHeadChairs }),
      ),
    [shape, width, depth, points, seatingDensity, maxHeadChairs],
  )

  const errors = isPolygon && points.length >= 3 ? validatePolygon(points) : []

  function commit(next: Vertex[]) {
    const n = normaliseVertices(next)
    onChange({ vertices: n.vertices, width: Math.round(n.width), depth: Math.round(n.depth) })
  }

  function finishDrawing() {
    if (draft.length < 3) return
    commit(draft)
    setDraft([])
    setDrawing(false)
  }

  const outlinePath = ring.map((v) => toScreen(v)).map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase text-grey-light tracking-wider">
          {isPolygon ? 'SHAPE OUTLINE' : 'PREVIEW'}
        </span>
        <span className="font-mono text-[10px] text-grey-light">
          {Math.round(ringArea(ring) / 100) / 100} m² · {Math.round(ringPerimeter(ring))} cm EDGE · {chairs.length} SEATS
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${view.box} ${view.box}`}
        className="w-full max-w-[260px] border border-grey-mid bg-black touch-none"
        style={{ cursor: drawing ? 'crosshair' : 'default' }}
        onClick={(e) => {
          if (!drawing) return
          setDraft((prev) => [...prev, toCm(e.clientX, e.clientY)])
        }}
        onDoubleClick={(e) => {
          e.preventDefault()
          if (drawing) finishDrawing()
        }}
        onPointerMove={(e) => {
          if (dragIndex == null) return
          const p = toCm(e.clientX, e.clientY)
          setDraft((prev) => prev.map((v, i) => (i === dragIndex ? p : v)))
        }}
        onPointerUp={() => {
          if (dragIndex == null) return
          setDragIndex(null)
          if (draft.length >= 3) commit(draft)
        }}
      >
        {/* grid */}
        <defs>
          <pattern id="fgrid" width={gridUnit * view.scale * 4} height={gridUnit * view.scale * 4} patternUnits="userSpaceOnUse">
            <path
              d={`M ${gridUnit * view.scale * 4} 0 L 0 0 0 ${gridUnit * view.scale * 4}`}
              fill="none"
              stroke="#2E2E2E"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width={view.box} height={view.box} fill="url(#fgrid)" />

        {/* chairs, drawn behind the surface so the table reads as on top */}
        {chairs.map((c) => {
          const p = toScreen(c)
          return (
            <rect
              key={c.id}
              x={p.x - 7}
              y={p.y - 7}
              width={14}
              height={14}
              transform={`rotate(${c.rotation} ${p.x} ${p.y})`}
              fill="#c4a530"
              fillOpacity={0.25}
              stroke="#c4a530"
              strokeWidth={1}
            />
          )
        })}

        {/* the outline itself */}
        {ring.length > 2 && (
          <polygon
            points={outlinePath}
            fill="#e6c347"
            fillOpacity={0.18}
            stroke={errors.length > 0 ? '#F87171' : '#e6c347'}
            strokeWidth={1.5}
          />
        )}

        {/* draft polyline while drawing */}
        {drawing && draft.length > 0 && (
          <polyline
            points={draft.map(toScreen).map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#4488FF"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {/* draggable vertices */}
        {isPolygon &&
          points.map((v, i) => {
            const p = toScreen(v)
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={5}
                fill={dragIndex === i ? '#FFFFFF' : '#000000'}
                stroke="#4488FF"
                strokeWidth={1.5}
                style={{ cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  if (!drawing) setDraft(points)
                  setDrawing(true)
                  setDragIndex(i)
                }}
              />
            )
          })}
      </svg>

      {isPolygon && (
        <div className="flex flex-wrap items-center gap-1">
          {!drawing ? (
            <button
              type="button"
              onClick={() => { setDraft([]); setDrawing(true) }}
              className="font-mono text-[10px] uppercase px-2 py-1 border border-grey-mid text-grey-light hover:border-white hover:text-white"
            >
              {points.length >= 3 ? 'REDRAW' : 'DRAW SHAPE'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={finishDrawing}
                disabled={draft.length < 3}
                className="font-mono text-[10px] uppercase px-2 py-1 border border-success text-success hover:bg-success hover:text-black disabled:opacity-40"
              >
                DONE ({draft.length})
              </button>
              <button
                type="button"
                onClick={() => setDraft((prev) => prev.slice(0, -1))}
                disabled={draft.length === 0}
                className="font-mono text-[10px] uppercase px-2 py-1 border border-grey-mid text-grey-light hover:border-white disabled:opacity-40"
              >
                UNDO POINT
              </button>
              <button
                type="button"
                onClick={() => { setDrawing(false); setDraft([]) }}
                className="font-mono text-[10px] uppercase px-2 py-1 border border-red-800/50 text-danger hover:border-danger"
              >
                CANCEL
              </button>
            </>
          )}
          <span className="font-mono text-[9px] text-grey-light">
            {drawing ? 'CLICK TO PLACE POINTS · DOUBLE-CLICK TO FINISH' : 'DRAG POINTS TO ADJUST'}
          </span>
        </div>
      )}

      {errors.map((e) => (
        <p key={e} className="font-mono text-[10px] text-danger">{e}</p>
      ))}
    </div>
  )
}
