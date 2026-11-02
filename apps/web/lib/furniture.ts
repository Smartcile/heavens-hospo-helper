/*
 * FURNITURE GEOMETRY + CHAIR ENGINE
 *
 * One outline model for every piece of furniture — rectangles, circles and
 * freeform polygons (L-booths, curved banquettes, sofas) all reduce to a closed
 * ring of vertices, so everything downstream (chairs, snapping, joining, area
 * totals) has exactly one case to handle.
 *
 * Chairs are stored as a position `t` in [0,1) around that ring rather than as
 * per-edge counts. That is what lets a chair be dragged to anywhere around any
 * shape, and it means rotating the table carries its chairs with it for free.
 *
 * Coordinate conventions:
 *  - Local space: origin at the bounding box's top-left, +y downwards.
 *  - Rings are closed (last vertex repeats the first) and wound so that the
 *    outward normal of an edge is (-uy, ux). `normaliseRing` enforces this.
 */

import type { SetupItemInput } from '@hospo-ops/types'

export type FurnitureShape = 'RECTANGLE' | 'CIRCLE' | 'POLYGON'

/**
 * The furniture a placement resolves to. Rows written before the furniture
 * migration still carry only `tableProfileId`, and the migration maps profile
 * ids onto the inventory items they became, so either key is valid to look up.
 */
export function setupItemFurnitureKey(item: SetupItemInput): string | null {
  return item.furnitureItemId ?? item.tableProfileId ?? null
}

export interface Vertex {
  x: number
  y: number
}

export interface FurnitureGeometry {
  shape: FurnitureShape
  /** Bounding box width in cm. */
  width: number
  /** Bounding box depth in cm. */
  depth: number
  /** POLYGON only — vertices in cm relative to the bounding box top-left. */
  vertices?: Vertex[] | null
}

/** A seat pinned to a position around its furniture's outline. */
export interface ChairSlot {
  id: string
  /** Position around the perimeter, 0..1. */
  t: number
  /** Distance out from the edge in cm. Defaults to `DEFAULT_CHAIR_OFFSET`. */
  offset?: number
}

/** A chair resolved to where it actually sits on the floor plan. */
export interface ChairPlacementWorld {
  id: string
  x: number
  y: number
  /** Degrees. 0 points along +x; the chair faces back towards the table. */
  rotation: number
  t: number
}

export interface Placement {
  x: number
  y: number
  rotation: number
}

export const DEFAULT_SEATING_DENSITY = 60 // cm of edge per chair
export const DEFAULT_CHAIR_OFFSET = 5 // cm gap between table edge and chair
export const CIRCLE_SEGMENTS = 48

// ── Ring construction ──────────────────────────────────────────────────────

function shoelace(ring: Vertex[]): number {
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i].x * ring[i + 1].y - ring[i + 1].x * ring[i].y
  }
  return sum / 2
}

/**
 * Close the ring and wind it so `(-uy, ux)` is the outward normal of every edge.
 * With y pointing down that means a negative shoelace area.
 */
export function normaliseRing(vertices: Vertex[]): Vertex[] {
  if (vertices.length < 3) return []

  const ring = vertices.map((v) => ({ x: v.x, y: v.y }))

  // Drop a duplicated closing vertex so we control closure ourselves.
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (ring.length > 3 && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) {
    ring.pop()
  }
  if (ring.length < 3) return []

  ring.push({ x: ring[0].x, y: ring[0].y })
  if (shoelace(ring) > 0) {
    const closed = ring.slice(0, -1).reverse()
    closed.push({ x: closed[0].x, y: closed[0].y })
    return closed
  }
  return ring
}

/** An ellipse inscribed in the bounding box, as a polygon. */
function ellipseRing(width: number, depth: number, segments = CIRCLE_SEGMENTS): Vertex[] {
  const rx = width / 2
  const ry = depth / 2
  const out: Vertex[] = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    out.push({ x: rx + rx * Math.cos(a), y: ry + ry * Math.sin(a) })
  }
  return out
}

/**
 * The closed outline of a piece of furniture, in local coordinates.
 * A POLYGON with unusable vertices falls back to its bounding box rather than
 * vanishing from the plan.
 */
export function outlineOf(geom: FurnitureGeometry): Vertex[] {
  const { shape, width, depth } = geom

  if (shape === 'CIRCLE') return normaliseRing(ellipseRing(width, depth))

  if (shape === 'POLYGON') {
    const vs = geom.vertices
    if (Array.isArray(vs) && vs.length >= 3) {
      const ring = normaliseRing(vs)
      if (ring.length >= 4) return ring
    }
    // fall through to the bounding box
  }

  return normaliseRing([
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ])
}

// ── Ring measurement ───────────────────────────────────────────────────────

export function ringPerimeter(ring: Vertex[]): number {
  let total = 0
  for (let i = 0; i < ring.length - 1; i++) {
    total += Math.hypot(ring[i + 1].x - ring[i].x, ring[i + 1].y - ring[i].y)
  }
  return total
}

export function ringArea(ring: Vertex[]): number {
  return Math.abs(shoelace(ring))
}

/** Bounding box of a set of vertices. */
export function boundsOf(vertices: Vertex[]): { x: number; y: number; width: number; depth: number } {
  if (vertices.length === 0) return { x: 0, y: 0, width: 0, depth: 0 }
  const xs = vertices.map((v) => v.x)
  const ys = vertices.map((v) => v.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, depth: Math.max(...ys) - minY }
}

/**
 * Shift vertices so the shape sits flush against the local origin, and report
 * the bounding box it now occupies. The polygon editor calls this on every save
 * so `elementWidth` / `elementDepth` always describe the drawn shape.
 */
export function normaliseVertices(vertices: Vertex[]): {
  vertices: Vertex[]
  width: number
  depth: number
} {
  const b = boundsOf(vertices)
  return {
    vertices: vertices.map((v) => ({ x: v.x - b.x, y: v.y - b.y })),
    width: b.width,
    depth: b.depth,
  }
}

// ── Walking the perimeter ──────────────────────────────────────────────────

interface EdgeSpan {
  /** Cumulative perimeter distance at the edge's start. */
  start: number
  length: number
  from: Vertex
  ux: number
  uy: number
  /** Outward unit normal. */
  nx: number
  ny: number
}

function edgeSpans(ring: Vertex[]): EdgeSpan[] {
  const spans: EdgeSpan[] = []
  let cursor = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const from = ring[i]
    const to = ring[i + 1]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length < 1e-9) continue
    const ux = dx / length
    const uy = dy / length
    spans.push({ start: cursor, length, from, ux, uy, nx: -uy, ny: ux })
    cursor += length
  }
  return spans
}

/** A run of segments that a person would call one side of the furniture. */
export interface LogicalEdge {
  /** Cumulative perimeter distance where the run begins. */
  start: number
  /** Total arc length of the run. */
  length: number
  /** Number of raw segments merged into it. */
  segments: number
}

/** Turn angle in degrees between two unit directions. */
function turnBetween(a: EdgeSpan, b: EdgeSpan): number {
  const dot = Math.min(Math.max(a.ux * b.ux + a.uy * b.uy, -1), 1)
  return (Math.acos(dot) * 180) / Math.PI
}

export const EDGE_MERGE_TOLERANCE_DEG = 30

/**
 * Collapse the raw segments into the sides a person would recognise.
 *
 * This is what lets one chair rule serve both shapes: a circle is polygonised
 * into dozens of ~7cm segments that would each be rejected as "too short to
 * seat", but they all bend gently, so they merge into a single 314cm side and
 * seat evenly around the curve. A rectangle's 90-degree corners exceed the
 * tolerance, so it keeps its four distinct sides and its head-edge capping.
 */
export function logicalEdges(
  ring: Vertex[],
  toleranceDeg = EDGE_MERGE_TOLERANCE_DEG,
): LogicalEdge[] {
  const spans = edgeSpans(ring)
  if (spans.length === 0) return []
  if (spans.length === 1) {
    return [{ start: spans[0].start, length: spans[0].length, segments: 1 }]
  }

  const groups: { spans: EdgeSpan[] }[] = [{ spans: [spans[0]] }]
  for (let i = 1; i < spans.length; i++) {
    const current = groups[groups.length - 1]
    const previous = current.spans[current.spans.length - 1]
    if (turnBetween(previous, spans[i]) < toleranceDeg) current.spans.push(spans[i])
    else groups.push({ spans: [spans[i]] })
  }

  // The ring is closed, so the last run may continue into the first one — the
  // seam of a polygonised circle falls exactly here.
  if (groups.length > 1) {
    const last = groups[groups.length - 1]
    const first = groups[0]
    const lastSpan = last.spans[last.spans.length - 1]
    if (turnBetween(lastSpan, first.spans[0]) < toleranceDeg) {
      first.spans = [...last.spans, ...first.spans]
      groups.pop()
    }
  }

  return groups.map((g) => ({
    start: g.spans[0].start,
    length: g.spans.reduce((sum, s) => sum + s.length, 0),
    segments: g.spans.length,
  }))
}

/** Wrap any number into [0,1). */
export function wrapT(t: number): number {
  if (!Number.isFinite(t)) return 0
  return ((t % 1) + 1) % 1
}

/**
 * The point at `t` around the ring, with the outward normal there.
 * `rotation` is the outward direction in degrees.
 */
export function pointAtPerimeter(
  ring: Vertex[],
  t: number,
): { x: number; y: number; rotation: number; nx: number; ny: number } {
  const spans = edgeSpans(ring)
  const total = ringPerimeter(ring)
  if (spans.length === 0 || total <= 0) return { x: 0, y: 0, rotation: 0, nx: 0, ny: -1 }

  const target = wrapT(t) * total
  let span = spans[spans.length - 1]
  for (const s of spans) {
    if (target < s.start + s.length) {
      span = s
      break
    }
  }
  const along = Math.min(Math.max(target - span.start, 0), span.length)

  return {
    x: span.from.x + span.ux * along,
    y: span.from.y + span.uy * along,
    rotation: (Math.atan2(span.ny, span.nx) * 180) / Math.PI,
    nx: span.nx,
    ny: span.ny,
  }
}

/**
 * Nearest point on the ring to an arbitrary point — this is what turns a chair
 * drag into a new `t`, so a chair slides around the outline instead of floating
 * off it.
 */
export function projectToPerimeter(
  ring: Vertex[],
  px: number,
  py: number,
): { t: number; x: number; y: number; distance: number } {
  const spans = edgeSpans(ring)
  const total = ringPerimeter(ring)
  if (spans.length === 0 || total <= 0) return { t: 0, x: px, y: py, distance: 0 }

  let best = { t: 0, x: spans[0].from.x, y: spans[0].from.y, distance: Infinity }

  for (const s of spans) {
    const vx = px - s.from.x
    const vy = py - s.from.y
    const along = Math.min(Math.max(vx * s.ux + vy * s.uy, 0), s.length)
    const cx = s.from.x + s.ux * along
    const cy = s.from.y + s.uy * along
    const distance = Math.hypot(px - cx, py - cy)
    if (distance < best.distance) {
      best = { t: (s.start + along) / total, x: cx, y: cy, distance }
    }
  }

  return best
}

// ── Default chair layout ───────────────────────────────────────────────────

export interface ChairLayoutOptions {
  /** cm of edge consumed per chair. */
  seatingDensity?: number | null
  /** Cap on chairs along a short (head) edge. */
  maxHeadChairs?: number
  /** Hard cap on total chairs; 0 or undefined means "as many as fit". */
  capacity?: number
  /** Edges shorter than this are skipped entirely. Defaults to 60% of density. */
  minEdgeLength?: number
}

function slotId(index: number): string {
  return `c${index}`
}

/**
 * Spread chairs around an outline, longest edges first.
 *
 * Head-edge capping only applies to genuinely rectangular-ish outlines: on a
 * circle or a freeform booth every edge is short, so applying it there would
 * wipe out nearly every seat.
 */
export function defaultChairSlots(
  geom: FurnitureGeometry,
  opts: ChairLayoutOptions = {},
): ChairSlot[] {
  const ring = outlineOf(geom)
  const edges = logicalEdges(ring)
  const total = ringPerimeter(ring)
  if (edges.length === 0 || total <= 0) return []

  const density = opts.seatingDensity && opts.seatingDensity > 0 ? opts.seatingDensity : DEFAULT_SEATING_DENSITY
  const minEdge = opts.minEdgeLength ?? density * 0.6
  const maxHead = Math.max(0, opts.maxHeadChairs ?? 1)
  const capacity = opts.capacity && opts.capacity > 0 ? opts.capacity : Infinity

  // A "head" cap only means something when there are long sides to contrast
  // with — i.e. a four-sided box. Curves and freeform outlines seat all the way
  // round, so capping there would strip out most of the seats.
  const applyHeadCap = geom.shape !== 'CIRCLE' && edges.length === 4
  const shortSide = Math.min(geom.width, geom.depth)

  const candidates: { t: number; edgeLength: number }[] = []

  for (const e of edges) {
    if (e.length < minEdge) continue

    let count = Math.floor(e.length / density)
    if (count < 1) continue

    if (applyHeadCap && e.length <= shortSide + 1e-6) {
      count = Math.min(count, maxHead)
    }
    if (count < 1) continue

    const spacing = e.length / count
    for (let i = 0; i < count; i++) {
      const along = (i + 0.5) * spacing
      candidates.push({ t: wrapT((e.start + along) / total), edgeLength: e.length })
    }
  }
  candidates.sort((a, b) => a.t - b.t)

  // Under a capacity cap, keep the seats on the longest edges — those are the
  // sides people actually sit along.
  let chosen = candidates
  if (candidates.length > capacity) {
    chosen = [...candidates]
      .sort((a, b) => b.edgeLength - a.edgeLength)
      .slice(0, capacity)
      .sort((a, b) => a.t - b.t)
  }

  return chosen.map((c, i) => ({ id: slotId(i), t: c.t }))
}

/** How many chairs fit around this outline at the given rules. */
export function maxChairsFor(geom: FurnitureGeometry, opts: ChairLayoutOptions = {}): number {
  return defaultChairSlots(geom, { ...opts, capacity: undefined }).length
}

// ── Local -> world ─────────────────────────────────────────────────────────

function rotatePoint(x: number, y: number, rad: number): Vertex {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return { x: x * c - y * s, y: x * s + y * c }
}

/**
 * Place a local ring onto the plan. Rotation is about the bounding box centre,
 * which is what makes a table spin in place rather than swing around its corner.
 */
export function toWorld(ring: Vertex[], geom: FurnitureGeometry, at: Placement): Vertex[] {
  const rad = ((at.rotation ?? 0) * Math.PI) / 180
  const cx = geom.width / 2
  const cy = geom.depth / 2
  return ring.map((v) => {
    const r = rotatePoint(v.x - cx, v.y - cy, rad)
    return { x: at.x + cx + r.x, y: at.y + cy + r.y }
  })
}

/** The world-space outline of a placed piece of furniture. */
export function worldOutline(geom: FurnitureGeometry, at: Placement): Vertex[] {
  return toWorld(outlineOf(geom), geom, at)
}

/**
 * Resolve chair slots to positions on the plan, pushed out from the edge by
 * their offset and facing back towards the furniture.
 */
export function chairWorldPlacements(
  geom: FurnitureGeometry,
  at: Placement,
  chairs: ChairSlot[],
  defaultOffset = DEFAULT_CHAIR_OFFSET,
): ChairPlacementWorld[] {
  const ring = outlineOf(geom)
  const rad = ((at.rotation ?? 0) * Math.PI) / 180
  const cx = geom.width / 2
  const cy = geom.depth / 2

  return chairs.map((chair) => {
    const p = pointAtPerimeter(ring, chair.t)
    const offset = chair.offset ?? defaultOffset
    const local = { x: p.x + p.nx * offset, y: p.y + p.ny * offset }
    const r = rotatePoint(local.x - cx, local.y - cy, rad)
    return {
      id: chair.id,
      x: at.x + cx + r.x,
      y: at.y + cy + r.y,
      rotation: p.rotation + (at.rotation ?? 0),
      t: chair.t,
    }
  })
}

/**
 * Turn a world-space drag into a new `t` for the chair being dragged — the
 * inverse of `chairWorldPlacements`, so dropping a chair anywhere near the
 * outline snaps it onto the nearest point.
 */
export function chairTFromWorld(
  geom: FurnitureGeometry,
  at: Placement,
  worldX: number,
  worldY: number,
): number {
  const rad = ((at.rotation ?? 0) * Math.PI) / 180
  const cx = geom.width / 2
  const cy = geom.depth / 2
  const local = rotatePoint(worldX - at.x - cx, worldY - at.y - cy, -rad)
  return projectToPerimeter(outlineOf(geom), local.x + cx, local.y + cy).t
}

// ── Chair set editing ──────────────────────────────────────────────────────

/** Move one chair to a new position around the outline. */
export function moveChair(chairs: ChairSlot[], id: string, t: number): ChairSlot[] {
  return chairs.map((c) => (c.id === id ? { ...c, t: wrapT(t) } : c))
}

export function removeChair(chairs: ChairSlot[], id: string): ChairSlot[] {
  return chairs.filter((c) => c.id !== id)
}

/** Add a chair at `t`, giving it an id that cannot collide with an existing one. */
export function addChair(chairs: ChairSlot[], t: number): ChairSlot[] {
  const used = new Set(chairs.map((c) => c.id))
  let n = chairs.length
  while (used.has(slotId(n))) n++
  return [...chairs, { id: slotId(n), t: wrapT(t) }].sort((a, b) => a.t - b.t)
}

/**
 * Re-space the chairs evenly around the outline, keeping the count. Used by the
 * "TIDY" action after a lot of manual dragging.
 */
export function redistributeChairs(geom: FurnitureGeometry, chairs: ChairSlot[]): ChairSlot[] {
  const count = chairs.length
  if (count === 0) return chairs
  const fresh = defaultChairSlots(geom, { capacity: count })
  if (fresh.length === count) {
    return chairs.map((c, i) => ({ ...c, t: fresh[i].t }))
  }
  return chairs.map((c, i) => ({ ...c, t: i / count }))
}

// ── Polygon validation (for the shape editor) ──────────────────────────────

function segmentsIntersect(a1: Vertex, a2: Vertex, b1: Vertex, b2: Vertex): boolean {
  const d = (p: Vertex, q: Vertex, r: Vertex) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = d(b1, b2, a1)
  const d2 = d(b1, b2, a2)
  const d3 = d(a1, a2, b1)
  const d4 = d(a1, a2, b2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/**
 * Reasons a drawn outline can't be used. Returns [] when the shape is fine.
 * Self-intersection matters because a crossed outline makes chair distribution
 * and area totals nonsense.
 */
export function validatePolygon(vertices: Vertex[]): string[] {
  const errors: string[] = []
  if (vertices.length < 3) {
    errors.push('A SHAPE NEEDS AT LEAST 3 POINTS')
    return errors
  }

  const b = boundsOf(vertices)
  if (b.width < 1 || b.depth < 1) errors.push('SHAPE IS TOO SMALL TO PLACE')

  const ring = normaliseRing(vertices)
  if (ring.length < 4) {
    errors.push('SHAPE IS DEGENERATE')
    return errors
  }
  if (ringArea(ring) < 1) errors.push('SHAPE HAS NO AREA — POINTS MAY BE IN A LINE')

  const n = ring.length - 1
  outer: for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // adjacent across the closing seam
      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        errors.push('EDGES CROSS OVER EACH OTHER')
        break outer
      }
    }
  }

  return errors
}
