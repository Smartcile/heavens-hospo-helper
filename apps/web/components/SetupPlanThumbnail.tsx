'use client'

// A small read-only table-plan preview for a FloorPlanSetup. The event builder
// uses it so a room setup shows its photos AND the table plan it points at
// without sending the user into the floor-plan editor.
//
// Deliberately simple SVG: items are drawn from their footprint and rotation.
// The admin/worker canvases remain the full-fidelity renderers.

import { useEffect, useState } from 'react'
import type { Vertex } from '@/lib/furniture'

interface RawItem {
  id: string
  x: number
  y: number
  rotation: number
  assignedNumber?: string | null
  label?: string | null
  furnitureItem?: {
    elementWidth?: number | null
    elementDepth?: number | null
    elementShape?: string | null
    elementVertices?: unknown
    defaultColour?: string | null
  } | null
  tableProfile?: { width?: number | null; depth?: number | null; colour?: string | null } | null
}

interface PlanItem {
  id: string
  x: number
  y: number
  rotation: number
  width: number
  depth: number
  shape: string
  vertices: Vertex[] | null
  colour: string
  label: string | null
}

function toPlanItem(i: RawItem): PlanItem {
  const f = i.furnitureItem
  const verts = Array.isArray(f?.elementVertices) ? (f!.elementVertices as Vertex[]) : null
  return {
    id: i.id,
    x: i.x,
    y: i.y,
    rotation: i.rotation ?? 0,
    width: f?.elementWidth ?? i.tableProfile?.width ?? 80,
    depth: f?.elementDepth ?? i.tableProfile?.depth ?? 80,
    shape: f?.elementShape ?? (verts ? 'POLYGON' : 'RECTANGLE'),
    vertices: verts,
    colour: f?.defaultColour ?? i.tableProfile?.colour ?? '#888888',
    label: i.assignedNumber ?? i.label ?? null,
  }
}

/** Corners in world space, rotated about the footprint centre. */
function corners(item: PlanItem): Vertex[] {
  const cx = item.x + item.width / 2
  const cy = item.y + item.depth / 2
  const rad = ((item.rotation ?? 0) * Math.PI) / 180
  const base: Vertex[] =
    item.shape === 'POLYGON' && item.vertices && item.vertices.length >= 3
      ? item.vertices
      : item.shape === 'CIRCLE'
        ? Array.from({ length: 16 }, (_, n) => {
            const a = (n / 16) * Math.PI * 2
            return { x: item.width / 2 + Math.cos(a) * (item.width / 2), y: item.depth / 2 + Math.sin(a) * (item.depth / 2) }
          })
        : [
            { x: 0, y: 0 },
            { x: item.width, y: 0 },
            { x: item.width, y: item.depth },
            { x: 0, y: item.depth },
          ]
  return base.map((p) => {
    const dx = p.x - item.width / 2
    const dy = p.y - item.depth / 2
    return {
      x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
      y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
    }
  })
}

export function SetupPlanThumbnail({
  planId,
  setupId,
  className = '',
}: {
  planId: string | null | undefined
  setupId: string | null | undefined
  className?: string
}) {
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    setItems(null)
    setFailed(false)
    if (!planId || !setupId) return () => { alive = false }
    fetch(`/api/admin/floorplan/${planId}/setups/${setupId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data) => {
        if (!alive) return
        const raw: RawItem[] = Array.isArray(data?.items) ? data.items : []
        setItems(raw.map(toPlanItem))
      })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [planId, setupId])

  if (!planId || !setupId) return null

  if (failed) {
    return <p className="font-mono text-xs uppercase text-grey-light">TABLE PLAN UNAVAILABLE</p>
  }
  if (!items) {
    return <p className="font-mono text-xs uppercase text-grey-light">LOADING TABLE PLAN…</p>
  }
  if (items.length === 0) {
    return <p className="font-mono text-xs uppercase text-grey-light">NO TABLES PLACED ON THIS PLAN YET</p>
  }

  const polys = items.map((item) => ({ item, ring: corners(item) }))
  const all = polys.flatMap((p) => p.ring)
  const minX = Math.min(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxX = Math.max(...all.map((p) => p.x))
  const maxY = Math.max(...all.map((p) => p.y))
  const pad = Math.max(20, (maxX - minX + maxY - minY) * 0.04)
  const vbX = minX - pad
  const vbY = minY - pad
  const vbW = Math.max(1, maxX - minX + pad * 2)
  const vbH = Math.max(1, maxY - minY + pad * 2)

  return (
    <svg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className={`w-full bg-black border border-grey-mid ${className}`}
      role="img"
      aria-label="Table plan preview"
    >
      {polys.map(({ item, ring }) => (
        <polygon
          key={item.id}
          points={ring.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={item.colour}
          fillOpacity={0.35}
          stroke={item.colour}
          strokeWidth={Math.max(1, Math.min(vbW, vbH) * 0.006)}
        />
      ))}
    </svg>
  )
}
