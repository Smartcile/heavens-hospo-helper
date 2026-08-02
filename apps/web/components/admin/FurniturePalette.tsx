'use client'

import { useMemo, useState } from 'react'
import { outlineOf, boundsOf, defaultChairSlots, chairWorldPlacements, type Vertex } from '@/lib/furniture'
import type { FurnitureView } from '@hospo-ops/types'

/**
 * The visual furniture picker.
 *
 * Replaces the palette that went missing when table profiles moved into
 * inventory — which is why nothing could be placed on a layout at all. Each tile
 * draws the piece's real outline and seats rather than naming it in a list, so
 * you pick a shape by looking at it.
 *
 * Drag a tile onto the canvas, or click to arm it and click the canvas to place.
 */

export const FURNITURE_DRAG_PREFIX = 'furniture:'

const TILE = 68

function Thumb({ item }: { item: FurnitureView }) {
  const geom = {
    shape: (item.shape as 'RECTANGLE' | 'CIRCLE' | 'POLYGON') ?? 'RECTANGLE',
    width: item.width,
    depth: item.depth,
    vertices: item.vertices as Vertex[] | null,
  }

  const { ring, chairs, scale, offset } = useMemo(() => {
    const r = outlineOf(geom)
    const cs = chairWorldPlacements(
      geom,
      { x: 0, y: 0, rotation: 0 },
      defaultChairSlots(geom, {
        seatingDensity: item.seatingDensity,
        maxHeadChairs: item.maxHeadChairs,
        capacity: item.defaultChairCount || undefined,
      }),
    )
    // Fit outline + chairs, so seats aren't clipped off the tile.
    const all = [...r, ...cs.map((c) => ({ x: c.x, y: c.y }))]
    const b = boundsOf(all)
    const pad = 8
    const s = Math.min((TILE - pad * 2) / Math.max(b.width, 1), (TILE - pad * 2) / Math.max(b.depth, 1))
    return {
      ring: r,
      chairs: cs,
      scale: s,
      offset: {
        x: pad + (TILE - pad * 2 - b.width * s) / 2 - b.x * s,
        y: pad + (TILE - pad * 2 - b.depth * s) / 2 - b.y * s,
      },
    }
  }, [item.shape, item.width, item.depth, item.vertices, item.seatingDensity, item.maxHeadChairs, item.defaultChairCount])

  const pts = ring.map((v) => `${offset.x + v.x * scale},${offset.y + v.y * scale}`).join(' ')

  return (
    <svg viewBox={`0 0 ${TILE} ${TILE}`} className="w-full h-full">
      {chairs.map((c) => (
        <circle
          key={c.id}
          cx={offset.x + c.x * scale}
          cy={offset.y + c.y * scale}
          r={Math.max(1.4, 9 * scale)}
          fill="#c4a530"
          fillOpacity={0.45}
        />
      ))}
      <polygon
        points={pts}
        fill={item.colour ?? '#e6c347'}
        fillOpacity={0.75}
        stroke={item.colour ?? '#e6c347'}
        strokeWidth={1}
      />
    </svg>
  )
}

interface Props {
  furniture: FurnitureView[]
  /** Armed for click-to-place; null when nothing is armed. */
  armedId: string | null
  onArm: (id: string | null) => void
  disabled?: boolean
  disabledReason?: string
}

export function FurniturePalette({ furniture, armedId, onArm, disabled, disabledReason }: Props) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('ALL')

  // Chairs are placed by seating a table, not dropped on the floor on their own.
  const placeable = furniture.filter((f) => f.furnitureType !== 'CHAIR')

  const types = useMemo(
    () => ['ALL', ...new Set(placeable.map((f) => f.furnitureType))],
    [placeable],
  )

  const shown = placeable.filter((f) => {
    if (typeFilter !== 'ALL' && f.furnitureType !== typeFilter) return false
    if (query && !f.name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  if (disabled) {
    return (
      <div className="border border-grey-mid p-3">
        <p className="font-mono text-[10px] text-grey-light uppercase">
          {disabledReason ?? 'PICK A LAYOUT TO PLACE FURNITURE'}
        </p>
      </div>
    )
  }

  return (
    <div className="border border-grey-mid">
      <div className="px-2 py-1.5 border-b border-grey-mid bg-grey-dark/40">
        <h3 className="font-mono text-[10px] font-bold uppercase text-white tracking-wider">FURNITURE</h3>
      </div>

      <div className="p-2 space-y-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SEARCH..."
          className="w-full bg-black border border-grey-mid text-white font-mono text-[10px] px-2 py-1 outline-none focus:border-white placeholder:text-grey-light"
        />

        {types.length > 2 && (
          <div className="flex flex-wrap gap-1">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`font-mono text-[9px] uppercase px-1.5 py-0.5 border ${
                  typeFilter === t
                    ? 'border-white text-white bg-grey-mid'
                    : 'border-grey-mid text-grey-light hover:border-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <p className="font-mono text-[10px] text-grey-light py-2">
            {placeable.length === 0
              ? 'NO FURNITURE YET — ADD IT UNDER INVENTORY → TABLES'
              : 'NOTHING MATCHES'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {shown.map((f) => {
              const available = Math.max(0, f.totalQty - f.placedCount)
              const out = f.totalQty > 0 && available === 0
              const armed = armedId === f.id

              return (
                <button
                  key={f.id}
                  draggable={!out}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', `${FURNITURE_DRAG_PREFIX}${f.id}`)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => onArm(armed ? null : f.id)}
                  title={out ? `ALL ${f.totalQty} ARE ALREADY PLACED` : `${f.name} — DRAG OR CLICK TO PLACE`}
                  className={`group border text-left transition-colors ${
                    armed
                      ? 'border-accent bg-accent/10'
                      : out
                        ? 'border-grey-mid opacity-40 cursor-not-allowed'
                        : 'border-grey-mid hover:border-white cursor-grab'
                  }`}
                >
                  <div className="aspect-square bg-black/60">
                    <Thumb item={f} />
                  </div>
                  <div className="px-1 py-0.5 border-t border-grey-mid">
                    <p className="font-mono text-[9px] text-white uppercase truncate leading-tight">{f.name}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[8px] text-grey-light">
                        {Math.round(f.width)}×{Math.round(f.depth)}
                      </span>
                      <span
                        className={`font-mono text-[8px] ${
                          out ? 'text-danger' : available > 0 ? 'text-accent' : 'text-grey-light'
                        }`}
                      >
                        {f.totalQty > 0 ? `${available}/${f.totalQty}` : '∞'}
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {armedId && (
          <p className="font-mono text-[9px] text-accent uppercase">
            CLICK THE PLAN TO PLACE · ESC TO CANCEL
          </p>
        )}
      </div>
    </div>
  )
}
