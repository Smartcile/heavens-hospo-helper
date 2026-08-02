/*
 * Smoke-check the furniture read path end to end, using the very helpers the
 * API routes use. Read-only — safe to run any time.
 *
 *   npm run db:verify-furniture [venueId]
 */
import { prisma } from '../index'
import { outlineOf, ringArea, ringPerimeter, defaultChairSlots } from '../../../apps/web/lib/furniture'

// `lib/furniture-server.ts` imports `@hospo-ops/db`, which does not resolve from
// inside this package, so the two small mappings it provides are mirrored here.
// The geometry engine itself is imported directly — that is the part worth
// checking against real rows.

type Vertex = { x: number; y: number }

function parseVertices(value: unknown): Vertex[] | null {
  if (!Array.isArray(value)) return null
  const pts = value
    .filter((v): v is { x: unknown; y: unknown } => !!v && typeof v === 'object')
    .map((v) => ({ x: Number(v.x), y: Number(v.y) }))
    .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y))
  return pts.length >= 3 ? pts : null
}

function shapeOf(value: unknown): 'RECTANGLE' | 'CIRCLE' | 'POLYGON' {
  const s = typeof value === 'string' ? value.toUpperCase() : ''
  return s === 'CIRCLE' || s === 'POLYGON' ? s : 'RECTANGLE'
}

/** Mirror of `resolvePlacedFurniture` — furniture first, deprecated profile second. */
function resolvePlaced(item: {
  furnitureItem?: { id: string; name: string; elementWidth: number | null; elementDepth: number | null; elementShape: string | null; elementVertices: unknown; defaultColour: string | null; defaultChairCount: number } | null
  tableProfile?: { id: string; name: string; width: number; depth: number; shape: string | null; colour: string | null; chairCount: number } | null
}) {
  const f = item.furnitureItem
  if (f) {
    return {
      id: f.id, name: f.name,
      width: f.elementWidth ?? 80, depth: f.elementDepth ?? 80,
      shape: shapeOf(f.elementShape), vertices: parseVertices(f.elementVertices),
      chairCount: f.defaultChairCount ?? 0,
    }
  }
  const p = item.tableProfile
  if (p) {
    return {
      id: p.id, name: p.name, width: p.width, depth: p.depth,
      shape: shapeOf(p.shape), vertices: null, chairCount: p.chairCount,
    }
  }
  return null
}

/** Mirror of `placedCounts` — one grouped query, not one per item. */
async function placedCounts(venueId: string) {
  const rows = await prisma.setupItem.groupBy({
    by: ['furnitureItemId'],
    where: {
      deletedAt: null,
      furnitureItemId: { not: null },
      setup: { deletedAt: null, floorPlan: { venueId, deletedAt: null } },
    },
    _count: { _all: true },
  })
  const out = new Map<string, number>()
  for (const r of rows) if (r.furnitureItemId) out.set(r.furnitureItemId, r._count._all)
  return out
}

const VENUE = process.argv[2] ?? '40e6b2e0-402e-4328-8f95-30818209fb6a'

async function main() {
  const venue = await prisma.venue.findFirst({ where: { id: VENUE }, select: { name: true } })
  console.log(`=== FURNITURE READ PATH — ${venue?.name ?? VENUE} ===\n`)

  // ── What GET /api/admin/furniture returns (drives the palette) ──
  const rows = await prisma.inventoryItem.findMany({
    where: { venueId: VENUE, deletedAt: null, isActive: true, furnitureType: { not: null } },
    include: { bomItems: true },
    orderBy: [{ furnitureType: 'asc' }, { name: 'asc' }],
  })
  const placed = await placedCounts(VENUE)
  const views = rows.map((r) => ({
    id: r.id,
    name: r.name,
    furnitureType: r.furnitureType ?? 'TABLE',
    shape: shapeOf(r.elementShape),
    width: r.elementWidth ?? 80,
    depth: r.elementDepth ?? 80,
    vertices: parseVertices(r.elementVertices),
    totalQty: r.totalQty ?? 0,
    placedCount: placed.get(r.id) ?? 0,
    defaultChairCount: r.defaultChairCount ?? 0,
    seatingDensity: r.seatingDensity,
    maxHeadChairs: r.maxHeadChairs ?? 1,
    bomItems: r.bomItems,
  }))

  console.log('PALETTE / FURNITURE LIBRARY')
  console.log('  NAME                 TYPE   SHAPE      SIZE       AVAIL  SEATS  BOM')
  for (const v of views) {
    const avail = v.totalQty > 0 ? `${v.totalQty - v.placedCount}/${v.totalQty}` : '∞'
    console.log(
      `  ${v.name.padEnd(20)} ${v.furnitureType.padEnd(6)} ${v.shape.padEnd(10)} ` +
      `${`${Math.round(v.width)}×${Math.round(v.depth)}`.padEnd(10)} ${avail.padEnd(6)} ` +
      `${String(v.defaultChairCount).padEnd(6)} ${v.bomItems.length}`,
    )
  }

  // ── Geometry actually resolves for every piece ──
  console.log('\nGEOMETRY + SEATING (computed, not stored)')
  let bad = 0
  for (const v of views.filter((f) => f.furnitureType !== 'CHAIR')) {
    const geom = { shape: v.shape as 'RECTANGLE' | 'CIRCLE' | 'POLYGON', width: v.width, depth: v.depth, vertices: v.vertices }
    const ring = outlineOf(geom)
    const seats = defaultChairSlots(geom, {
      seatingDensity: v.seatingDensity,
      maxHeadChairs: v.maxHeadChairs,
      capacity: v.defaultChairCount || undefined,
    })
    const ok = ring.length >= 4 && ringArea(ring) > 0
    if (!ok) bad++
    console.log(
      `  ${ok ? 'OK ' : 'BAD'} ${v.name.padEnd(20)} ${String(ring.length - 1).padStart(2)} pts  ` +
      `${(ringArea(ring) / 10000).toFixed(2).padStart(6)} m²  ` +
      `${Math.round(ringPerimeter(ring)).toString().padStart(4)} cm edge  ` +
      `${String(seats.length).padStart(2)} seats fit`,
    )
  }

  // ── Layouts ──
  console.log('\nLAYOUTS')
  const setups = await prisma.floorPlanSetup.findMany({
    where: { deletedAt: null, floorPlan: { venueId: VENUE, deletedAt: null } },
    include: {
      floorPlan: { select: { name: true } },
      items: {
        where: { deletedAt: null },
        include: { furnitureItem: true, tableProfile: true },
      },
    },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })

  for (const s of setups) {
    let seats = 0
    let unresolved = 0
    const groups = new Set<string>()
    for (const i of s.items) {
      const f = resolvePlaced(i)
      if (!f) { unresolved++; continue }
      seats += Array.isArray(i.chairs) ? (i.chairs as unknown[]).length : f.chairCount
      if (i.tableGroupId) groups.add(i.tableGroupId)
    }
    console.log(
      `  ${s.isDefault ? '★' : ' '} ${s.name.padEnd(20)} (${s.floorPlan.name})  ` +
      `${String(s.items.length).padStart(2)} tables · ${String(seats).padStart(3)} seats · ` +
      `${groups.size} joined run(s)${unresolved ? ` · ${unresolved} UNRESOLVED` : ''}`,
    )
    if (unresolved > 0) bad++
  }

  const defaults = setups.filter((s) => s.isDefault)
  console.log(`\n  default layouts: ${defaults.length} (must be exactly 1 per plan)`)

  // ── Bookings resolve to real tables ──
  const bookings = await prisma.booking.findMany({
    where: { venueId: VENUE, deletedAt: null },
    include: { tables: { include: { setupItem: { select: { assignedNumber: true } } } } },
    orderBy: { startTime: 'asc' },
    take: 10,
  })
  console.log('\nBOOKINGS')
  for (const b of bookings) {
    const nums = b.tables.map((t) => t.setupItem?.assignedNumber ?? '?').join(', ')
    console.log(`  ${b.startTime}-${b.endTime}  ${String(b.partySize).padStart(2)} pax  ${b.contactName?.padEnd(20)} → ${nums || 'NO TABLE'}`)
    if (b.tables.length === 0) bad++
  }

  console.log(bad === 0 ? '\nAll checks passed.' : `\n${bad} problem(s) found.`)
  if (bad > 0) process.exitCode = 1
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
