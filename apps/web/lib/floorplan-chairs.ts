import type { TableEdge, EdgeChairs } from '@hospo-ops/types'

export type { TableEdge, EdgeChairs } from '@hospo-ops/types'

export const TABLE_EDGES: TableEdge[] = ['top', 'bottom', 'left', 'right']

export const DEFAULT_SEATING_DENSITY = 60 // cm per chair along an edge

export function emptyEdgeChairs(): EdgeChairs {
  return { top: 0, bottom: 0, left: 0, right: 0 }
}

export function edgeTotal(edges: EdgeChairs): number {
  return TABLE_EDGES.reduce((sum, e) => sum + (edges[e] ?? 0), 0)
}

export interface EdgeChairOpts {
  width: number
  depth: number
  seatingDensity?: number | null
  maxHeadChairs?: number
  capacity: number
}

/** Whether an edge sits on the short (head) dimension of the table. */
function isHeadEdge(edge: TableEdge, width: number, depth: number): boolean {
  // Head edges are the ones perpendicular to the long axis (i.e. the short sides).
  return width >= depth ? edge === 'left' || edge === 'right' : edge === 'top' || edge === 'bottom'
}

/** Max chairs that physically fit on one edge, capped by head rules on short edges. */
export function maxChairsForEdge(edge: TableEdge, opts: EdgeChairOpts): number {
  const { width, depth, maxHeadChairs = 1 } = opts
  const density = opts.seatingDensity && opts.seatingDensity > 0 ? opts.seatingDensity : DEFAULT_SEATING_DENSITY
  const len = edge === 'top' || edge === 'bottom' ? width : depth
  let m = Math.max(0, Math.floor(len / density))
  if (isHeadEdge(edge, width, depth)) m = Math.min(m, Math.max(0, maxHeadChairs))
  return m
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Add (delta>0) or remove (delta<0) chairs on one edge.
 * Clamps to the edge's physical max and never lets the total exceed capacity.
 */
export function adjustEdgeChairs(
  edges: EdgeChairs,
  edge: TableEdge,
  delta: number,
  opts: EdgeChairOpts,
): EdgeChairs {
  const maxE = maxChairsForEdge(edge, opts)
  const current = edges[edge] ?? 0
  const next = clamp(current + delta, 0, maxE)
  if (next === current) return edges
  const candidate = { ...edges, [edge]: next }
  if (delta > 0 && edgeTotal(candidate) > opts.capacity) return edges
  return candidate
}

/**
 * Default chair layout for a solo table: fill the long edges evenly first,
 * then the head edges, up to the profile capacity and each edge's physical max.
 */
export function defaultEdgeChairs(opts: EdgeChairOpts): EdgeChairs {
  const edges = emptyEdgeChairs()
  const longEdges: TableEdge[] = opts.width >= opts.depth ? ['top', 'bottom'] : ['left', 'right']
  const headEdges: TableEdge[] = opts.width >= opts.depth ? ['left', 'right'] : ['top', 'bottom']
  const maxes: Record<TableEdge, number> = {
    top: maxChairsForEdge('top', opts),
    bottom: maxChairsForEdge('bottom', opts),
    left: maxChairsForEdge('left', opts),
    right: maxChairsForEdge('right', opts),
  }
  let remaining = Math.max(0, opts.capacity)
  for (const group of [longEdges, headEdges]) {
    let progressed = true
    while (remaining > 0 && progressed) {
      progressed = false
      for (const e of group) {
        if (remaining <= 0) break
        if (edges[e] < maxes[e]) {
          edges[e]++
          remaining--
          progressed = true
        }
      }
    }
  }
  return edges
}
