import polygonClipping from 'polygon-clipping'
import { setupItemFurnitureKey } from './furniture'
import type { SetupItemInput, InventoryShortage, ChairPlacement, RectangleTable } from '@hospo-ops/types'

export type {
  SetupItemInput,
  TableProfileBomItem,
  InventoryShortage,
  ChairPlacement,
  RectangleTable,
} from '@hospo-ops/types'

export interface TableProfileWithBom {
  id: string
  name: string
  chairCount: number
  seatingDensity: number | null
  width: number
  depth: number
  maxHeadChairs: number
  bomItems: { inventoryItemId: string; quantity: number; perChair: boolean }[]
}

export interface InventoryStock {
  itemId: string
  name: string
  available: number
}

/**
 * Look up the furniture behind a placement, tolerating rows that still carry
 * only the old `tableProfileId` because the furniture migration hasn't run yet.
 */
function profileFor(
  profiles: Map<string, TableProfileWithBom>,
  item: SetupItemInput,
): TableProfileWithBom | undefined {
  const key = setupItemFurnitureKey(item)
  return key ? profiles.get(key) : undefined
}

type Pair = [number, number]

// ── Geometry Helpers ──

function rotate(x: number, y: number, angleRad: number): Pair {
  const c = Math.cos(angleRad)
  const s = Math.sin(angleRad)
  return [x * c - y * s, x * s + y * c]
}

export function rectangleToCorners(
  r: RectangleTable,
): Pair[] {
  const hw = r.width / 2
  const hd = r.depth / 2
  const cx = r.x + hw
  const cy = r.y + hd
  const rad = (r.rotation * Math.PI) / 180
  const local: Pair[] = [
    [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd],
  ]
  return local.map(([lx, ly]) => {
    const [rx, ry] = rotate(lx, ly, rad)
    return [cx + rx, cy + ry]
  })
}

export function unionTablePolygons(
  tables: RectangleTable[],
): Pair[][] {
  if (tables.length === 0) return []
  if (tables.length === 1) {
    const corners = rectangleToCorners(tables[0])
    const ring: Pair[] = [...corners, corners[0]]
    return [ring]
  }
  const polygons: Pair[][][] = tables.map((t) => {
    const corners = rectangleToCorners(t)
    const ring: Pair[] = [...corners, corners[0]]
    return [ring]
  })
  try {
    const result = polygonClipping.union(
      polygons[0],
      ...polygons.slice(1),
    ) as Pair[][][]
    return result.flatMap((polygon) => polygon) as Pair[][]
  } catch {
    return tables.map((t) => {
      const corners = rectangleToCorners(t)
      const ring: Pair[] = [...corners, corners[0]]
      return ring
    })
  }
}

export function polygonPerimeter(ring: Pair[]): number {
  let total = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0]
    const dy = ring[i + 1][1] - ring[i][1]
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return total
}

function polygonSignedArea(ring: Pair[]): number {
  let area = 0
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  }
  return area / 2
}

function simplifyRing(ring: Pair[], tolerance = 0.1): Pair[] {
  if (ring.length < 4) return ring
  const result: Pair[] = [ring[0]]
  for (let i = 1; i < ring.length - 1; i++) {
    const [px, py] = result[result.length - 1]
    const [cx, cy] = ring[i]
    const [nx, ny] = ring[i + 1]
    const dx1 = cx - px
    const dy1 = cy - py
    const dx2 = nx - cx
    const dy2 = ny - cy
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
    if (len1 < 0.01 || len2 < 0.01) continue
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2) / (len1 * len2)
    if (cross > tolerance) {
      result.push(ring[i])
    }
  }
  if (ring.length > 0) result.push(ring[ring.length - 1])
  return result
}

export function distributeChairsAlongPerimeter(
  ring: Pair[],
  density: number,
  edgeOffset: number = 20,
  headWidth?: number,
  maxHeadChairs?: number,
  headDirectionDeg?: number,
  minEdgeLen?: number,
): ChairPlacement[] {
  if (ring.length < 3 || density <= 0) return []
  ring = simplifyRing(ring)
  const minLen = minEdgeLen ?? density * 0.6
  const placements: ChairPlacement[] = []

  let verts = ring
  if (polygonSignedArea(ring) > 0) {
    verts = [...ring].reverse()
  }

  for (let i = 0; i < verts.length - 1; i++) {
    const [x1, y1] = verts[i]
    const [x2, y2] = verts[i + 1]
    const dx = x2 - x1
    const dy = y2 - y1
    const edgeLen = Math.sqrt(dx * dx + dy * dy)

    if (edgeLen < minLen) continue

    const ux = dx / edgeLen
    const uy = dy / edgeLen

    let chairsOnEdge = Math.floor(edgeLen / density)
    if (chairsOnEdge < 1) continue

    // Head-of-table constraint
    if (
      headWidth != null && maxHeadChairs != null && headDirectionDeg != null &&
      headWidth > 0 && headDirectionDeg !== undefined
    ) {
      let edgeDirDeg = Math.atan2(dy, dx) * (180 / Math.PI)
      edgeDirDeg = ((edgeDirDeg % 180) + 180) % 180
      const headDirNorm = ((headDirectionDeg % 180) + 180) % 180
      let angleDiff = Math.abs(edgeDirDeg - headDirNorm)
      if (angleDiff > 90) angleDiff = 180 - angleDiff
      if (angleDiff < 5) {
        const headMultiplier = Math.max(1, Math.round(edgeLen / headWidth))
        chairsOnEdge = Math.min(chairsOnEdge, maxHeadChairs * headMultiplier)
      }
    }

    // CW polygon: outward = left turn of edge direction = (-uy, ux)
    const nx = -uy
    const ny = ux
    const spacing = edgeLen / chairsOnEdge

    for (let j = 0; j < chairsOnEdge; j++) {
      const t = (j + 0.5) * spacing
      const cx = x1 + ux * t + nx * edgeOffset
      const cy = y1 + uy * t + ny * edgeOffset
      const rot = Math.atan2(ny, nx) * (180 / Math.PI)
      placements.push({ x: cx, y: cy, rotation: rot })
    }
  }

  return placements
}

export function computeGroupChairs(
  tables: RectangleTable[],
  seatingDensity: number,
  edgeOffset?: number,
  headWidth?: number,
  maxHeadChairs?: number,
  headDirectionDeg?: number,
): { maxChairs: number; placements: ChairPlacement[] } {
  if (tables.length === 0) return { maxChairs: 0, placements: [] }
  if (seatingDensity <= 0) return { maxChairs: 0, placements: [] }

  const unionPolygons = unionTablePolygons(tables)
  let maxChairs = 0
  const allPlacements: ChairPlacement[] = []

  for (const ring of unionPolygons) {
    const simplified = simplifyRing(ring)
    const placements = distributeChairsAlongPerimeter(
      simplified, seatingDensity, edgeOffset, headWidth, maxHeadChairs, headDirectionDeg,
    )
    allPlacements.push(...placements)
    maxChairs += placements.length
  }

  return { maxChairs, placements: allPlacements }
}

export function computeEffectiveChairs(
  tables: RectangleTable[],
  profile: {
    chairCount: number
    seatingDensity: number | null
    width: number
    depth: number
    maxHeadChairs: number
  },
): number {
  if (profile.seatingDensity == null || profile.seatingDensity <= 0 || tables.length <= 1) {
    return tables.length * profile.chairCount
  }
  const headWidth = Math.min(profile.width, profile.depth)
  let headDir: number | undefined
  if (profile.width !== profile.depth) {
    const rotationBase = tables[0].rotation % 180
    headDir = profile.width > profile.depth
      ? ((rotationBase + 90) % 180 + 180) % 180
      : ((rotationBase % 180) + 180) % 180
  }
  const { maxChairs } = computeGroupChairs(
    tables, profile.seatingDensity, undefined,
    headWidth, profile.maxHeadChairs, headDir,
  )
  return Math.min(maxChairs, tables.length * profile.chairCount)
}

// ── Inventory Calculation ──

export function calculateSetupInventory(
  setupItems: SetupItemInput[],
  profiles: Map<string, TableProfileWithBom>,
  inventory: Map<string, InventoryStock>,
): InventoryShortage[] {
  const groups = new Map<string | null, SetupItemInput[]>()
  for (const item of setupItems) {
    const key = item.tableGroupId ?? `__solo_${item.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  for (const [key, members] of groups) {
    if (members.length <= 1) continue
    const profileIds = new Set(members.map(setupItemFurnitureKey))
    if (profileIds.size > 1) {
      groups.delete(key)
      for (const m of members) {
        groups.set(`__solo_${m.id}`, [m])
      }
    }
  }

  const tally = new Map<string, number>()

  for (const [, members] of groups) {
    const profileId = setupItemFurnitureKey(members[0])
    const profile = profileId ? profiles.get(profileId) : undefined
    if (!profile) continue

    let chairCount: number
    if (members.length > 1 && profile.seatingDensity != null && profile.seatingDensity > 0) {
      const tables: RectangleTable[] = members.map((m) => ({
        x: m.x,
        y: m.y,
        width: m.width,
        depth: m.depth,
        rotation: m.rotation,
      }))
      chairCount = computeEffectiveChairs(tables, {
        chairCount: profile.chairCount,
        seatingDensity: profile.seatingDensity,
        width: profile.width,
        depth: profile.depth,
        maxHeadChairs: profile.maxHeadChairs,
      })
    } else {
      chairCount = members.length * profile.chairCount
    }

    for (const bom of profile.bomItems) {
      const qty = bom.perChair ? bom.quantity * chairCount : bom.quantity * members.length
      tally.set(bom.inventoryItemId, (tally.get(bom.inventoryItemId) ?? 0) + qty)
    }
  }

  const shortages: InventoryShortage[] = []
  for (const [itemId, required] of tally) {
    const stock = inventory.get(itemId)
    const available = stock?.available ?? 0
    if (required > available) {
      shortages.push({
        itemId,
        itemName: stock?.name ?? itemId,
        required,
        available,
        shortage: required - available,
      })
    }
  }

  shortages.sort((a, b) => b.shortage - a.shortage)
  return shortages
}

// ── Per-section live totals (tables + seats per zone) ──

export interface SectionZoneRect {
  sectionId: string
  x: number
  y: number
  width: number
  height: number
}

export interface SectionTotal {
  sectionId: string | null
  tables: number
  seats: number
}

function centreOf(item: SetupItemInput): { x: number; y: number } {
  return { x: item.x + item.width / 2, y: item.y + item.depth / 2 }
}

function zoneSectionAt(cx: number, cy: number, zones: SectionZoneRect[]): string | null {
  for (const z of zones) {
    if (cx >= z.x && cx <= z.x + z.width && cy >= z.y && cy <= z.y + z.height) return z.sectionId
  }
  return null
}

/**
 * Seats on one placement. Chairs positioned around the outline are the truth
 * when present; per-edge counts are still read so pre-migration rows keep
 * reporting real numbers instead of dropping to the furniture default.
 */
function soloSeats(item: SetupItemInput, profile?: TableProfileWithBom): number {
  if (Array.isArray(item.chairs)) return item.chairs.length
  const e = item.chairEdges
  if (e) return (e.top ?? 0) + (e.bottom ?? 0) + (e.left ?? 0) + (e.right ?? 0)
  return profile?.chairCount ?? 0
}

/**
 * Tally tables + effective seats per section zone. Grouped tables are counted as a
 * unit (rules-based effective chairs) and assigned to the zone under their centroid.
 */
export function computeSetupSectionTotals(
  setupItems: SetupItemInput[],
  zones: SectionZoneRect[],
  profiles: Map<string, TableProfileWithBom>,
): SectionTotal[] {
  const tally = new Map<string | null, { tables: number; seats: number }>()
  const bump = (sectionId: string | null, tables: number, seats: number) => {
    const cur = tally.get(sectionId) ?? { tables: 0, seats: 0 }
    cur.tables += tables; cur.seats += seats
    tally.set(sectionId, cur)
  }

  // Split into groups (>=2 same-profile members) and solo items
  const groups = new Map<string, SetupItemInput[]>()
  const solos: SetupItemInput[] = []
  for (const item of setupItems) {
    if (item.tableGroupId) {
      if (!groups.has(item.tableGroupId)) groups.set(item.tableGroupId, [])
      groups.get(item.tableGroupId)!.push(item)
    } else {
      solos.push(item)
    }
  }

  for (const item of solos) {
    const c = centreOf(item)
    bump(zoneSectionAt(c.x, c.y, zones), 1, soloSeats(item, profileFor(profiles, item)))
  }

  for (const members of groups.values()) {
    if (members.length === 1) {
      const item = members[0]
      const c = centreOf(item)
      bump(zoneSectionAt(c.x, c.y, zones), 1, soloSeats(item, profileFor(profiles, item)))
      continue
    }
    const profile = profileFor(profiles, members[0])
    const tables: RectangleTable[] = members.map((m) => ({ x: m.x, y: m.y, width: m.width, depth: m.depth, rotation: m.rotation }))
    const seats = profile
      ? computeEffectiveChairs(tables, {
          chairCount: profile.chairCount,
          seatingDensity: profile.seatingDensity,
          width: profile.width,
          depth: profile.depth,
          maxHeadChairs: profile.maxHeadChairs,
        })
      : 0
    // Assign the group to the zone under its centroid
    const cx = members.reduce((s, m) => s + m.x + m.width / 2, 0) / members.length
    const cy = members.reduce((s, m) => s + m.y + m.depth / 2, 0) / members.length
    bump(zoneSectionAt(cx, cy, zones), members.length, seats)
  }

  return [...tally.entries()].map(([sectionId, v]) => ({ sectionId, tables: v.tables, seats: v.seats }))
}

// ── Point-in-Polygon ──

export function pointInPolygon(
  px: number,
  py: number,
  vertices: { x: number; y: number }[],
): boolean {
  const n = vertices.length
  if (n < 3) return false
  let inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x
    const yi = vertices[i].y
    const xj = vertices[j].x
    const yj = vertices[j].y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}
