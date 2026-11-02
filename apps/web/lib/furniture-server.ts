/*
 * Server-side furniture helpers.
 *
 * Furniture is just an InventoryItem with geometry fields set, so everything
 * here is about presenting that one row consistently to the planner and the
 * inventory page — including how many pieces are already placed, which is what
 * drives the availability badges on the palette.
 */
import { prisma, Prisma } from '@hospo-ops/db'
import type { FurnitureView } from '@hospo-ops/types'

/** Categories whose items are furniture rather than consumable stock. */
export const FURNITURE_CATEGORY_NAMES = ['TABLES', 'FURNITURE']

export const FURNITURE_TYPES = ['TABLE', 'CHAIR', 'BOOTH', 'SOFA', 'BAR', 'OTHER'] as const
export type FurnitureType = (typeof FURNITURE_TYPES)[number]

export function isFurnitureType(value: unknown): value is FurnitureType {
  return typeof value === 'string' && (FURNITURE_TYPES as readonly string[]).includes(value)
}

export const FURNITURE_SHAPES = ['RECTANGLE', 'CIRCLE', 'POLYGON'] as const

export function normaliseShape(value: unknown): string {
  const s = typeof value === 'string' ? value.toUpperCase() : ''
  return (FURNITURE_SHAPES as readonly string[]).includes(s) ? s : 'RECTANGLE'
}

/** A Json column value safe to hand back to Prisma on write. */
export function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

/** Vertices arrive from the client as unknown Json — keep only real points. */
export function parseVertices(value: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(value)) return null
  const points = value
    .filter((v): v is { x: unknown; y: unknown } => !!v && typeof v === 'object')
    .map((v) => ({ x: Number(v.x), y: Number(v.y) }))
    .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y))
  return points.length >= 3 ? points : null
}

/** Table numbers arrive as unknown Json — keep only non-empty strings. */
export function parseTableNumbers(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const nums = value.map((v) => String(v).trim().toUpperCase()).filter(Boolean)
  return nums.length > 0 ? [...new Set(nums)] : null
}

/** The Prisma `include` every furniture read shares. */
export const furnitureInclude = {
  bomItems: {
    include: { item: { select: { id: true, name: true, unit: true } } },
  },
} satisfies Prisma.InventoryItemInclude

type FurnitureRow = Prisma.InventoryItemGetPayload<{ include: typeof furnitureInclude }>

/**
 * Shape a row for the client. `placedCount` is passed in rather than derived per
 * row — counting placements one query per item is what made the old orders page
 * slow, and the same trap is here.
 */
export function toFurnitureView(row: FurnitureRow, placedCount = 0): FurnitureView {
  const imageUrls = Array.isArray(row.imageUrls) ? row.imageUrls : []
  return {
    id: row.id,
    venueId: row.venueId,
    name: row.name,
    furnitureType: row.furnitureType ?? 'TABLE',
    shape: normaliseShape(row.elementShape),
    width: row.elementWidth ?? 80,
    depth: row.elementDepth ?? 80,
    vertices: parseVertices(row.elementVertices),
    colour: row.defaultColour,
    imageUrl: typeof imageUrls[0] === 'string' ? imageUrls[0] : null,
    totalQty: row.totalQty ?? 0,
    placedCount,
    defaultChairCount: row.defaultChairCount ?? 0,
    seatingDensity: row.seatingDensity,
    maxHeadChairs: row.maxHeadChairs ?? 1,
    tableNumbers: parseTableNumbers(row.tableNumbers),
    chairItemId: row.chairItemId,
    categoryId: row.categoryId,
    isActive: row.isActive,
    bomItems: row.bomItems.map((b) => ({
      inventoryItemId: b.inventoryItemId,
      quantity: b.quantity,
      perChair: b.perChair,
    })),
  }
}

/**
 * How many of each furniture item are currently placed on a layout, across
 * every active layout in the venue. One grouped query, not one per item.
 */
export async function placedCounts(venueId: string | null): Promise<Map<string, number>> {
  const rows = await prisma.setupItem.groupBy({
    by: ['furnitureItemId'],
    where: {
      deletedAt: null,
      furnitureItemId: { not: null },
      setup: {
        deletedAt: null,
        ...(venueId ? { floorPlan: { venueId, deletedAt: null } } : { floorPlan: { deletedAt: null } }),
      },
    },
    _count: { _all: true },
  })

  const out = new Map<string, number>()
  for (const r of rows) {
    if (r.furnitureItemId) out.set(r.furnitureItemId, r._count._all)
  }
  return out
}

/** The venue's furniture category, created on first use. */
export async function furnitureCategoryId(venueId: string): Promise<string> {
  const existing = await prisma.inventoryCategory.findFirst({
    where: {
      name: { in: FURNITURE_CATEGORY_NAMES },
      deletedAt: null,
      OR: [{ venueId }, { venueId: null }],
    },
    orderBy: [{ venueId: 'desc' }, { name: 'asc' }],
  })
  if (existing) return existing.id

  const created = await prisma.inventoryCategory.create({
    data: { venueId, name: 'TABLES', tab: 'OTHER', isBuiltIn: true, showEquipmentFields: true },
  })
  return created.id
}

/** The furniture behind a placement, flattened for consumers. */
export interface ResolvedFurniture {
  id: string
  name: string
  width: number
  depth: number
  shape: string
  vertices: { x: number; y: number }[] | null
  colour: string | null
  chairCount: number
  seatingDensity: number | null
  maxHeadChairs: number
}

/** Minimal shapes so callers can pass whatever `select` they already use. */
type FurnitureSide = {
  id: string
  name: string
  elementWidth?: number | null
  elementDepth?: number | null
  elementShape?: string | null
  elementVertices?: unknown
  defaultColour?: string | null
  defaultChairCount?: number | null
  seatingDensity?: number | null
  maxHeadChairs?: number | null
} | null | undefined

// Every field beyond id/name is optional: callers select only what they need
// (the booking grid wants a name and a colour, the planner wants geometry), and
// requiring the full set would force unrelated routes to over-fetch.
type ProfileSide = {
  id: string
  name: string
  width?: number | null
  depth?: number | null
  shape?: string | null
  colour?: string | null
  chairCount?: number | null
  seatingDensity?: number | null
  maxHeadChairs?: number | null
} | null | undefined

/**
 * Resolve a placement to its furniture, preferring the unified inventory row
 * and falling back to the deprecated profile.
 *
 * Both are nullable now, so this is also the single place that decides what a
 * placement pointing at nothing means: null, for the caller to skip. Without it
 * every consumer would need its own null dance and one of them would get it
 * wrong and render a zero-size table.
 */
export function resolvePlacedFurniture(item: {
  furnitureItem?: FurnitureSide
  tableProfile?: ProfileSide
}): ResolvedFurniture | null {
  const f = item.furnitureItem
  if (f) {
    return {
      id: f.id,
      name: f.name,
      width: f.elementWidth ?? 80,
      depth: f.elementDepth ?? 80,
      shape: normaliseShape(f.elementShape),
      vertices: parseVertices(f.elementVertices),
      colour: f.defaultColour ?? null,
      chairCount: f.defaultChairCount ?? 0,
      seatingDensity: f.seatingDensity ?? null,
      maxHeadChairs: f.maxHeadChairs ?? 1,
    }
  }

  const p = item.tableProfile
  if (p) {
    return {
      id: p.id,
      name: p.name,
      width: p.width ?? 80,
      depth: p.depth ?? 80,
      shape: normaliseShape(p.shape),
      vertices: null,
      colour: p.colour ?? null,
      chairCount: p.chairCount ?? 0,
      seatingDensity: p.seatingDensity ?? null,
      maxHeadChairs: p.maxHeadChairs ?? 1,
    }
  }

  return null
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Replace a furniture item's bill of materials with the supplied set. */
export async function writeBom(tx: Tx, furnitureItemId: string, bomItems: unknown) {
  if (!Array.isArray(bomItems)) return

  const rows = bomItems
    .filter((b): b is { inventoryItemId: string; quantity?: number; perChair?: boolean } =>
      !!b && typeof b === 'object' && typeof (b as { inventoryItemId?: unknown }).inventoryItemId === 'string')
    // A piece of furniture cannot be a component of itself.
    .filter((b) => b.inventoryItemId !== furnitureItemId)

  const keep = rows.map((b) => b.inventoryItemId)
  await tx.furnitureBomItem.deleteMany({
    where: { furnitureItemId, ...(keep.length > 0 ? { inventoryItemId: { notIn: keep } } : {}) },
  })

  for (const b of rows) {
    await tx.furnitureBomItem.upsert({
      where: { furnitureItemId_inventoryItemId: { furnitureItemId, inventoryItemId: b.inventoryItemId } },
      update: { quantity: Number(b.quantity) || 1, perChair: !!b.perChair },
      create: {
        furnitureItemId,
        inventoryItemId: b.inventoryItemId,
        quantity: Number(b.quantity) || 1,
        perChair: !!b.perChair,
      },
    })
  }
}

/**
 * Guarantee the floor plan has exactly one default layout and return it.
 * The default layout is the venue's everyday arrangement: it owns the real
 * table numbers, cannot be deleted, and is what the plan falls back to when no
 * event layout is active.
 */
export async function ensureDefaultSetup(floorPlanId: string) {
  const existing = await prisma.floorPlanSetup.findFirst({
    where: { floorPlanId, isDefault: true, deletedAt: null },
  })
  if (existing) return existing

  // Adopt the oldest everyday layout rather than stranding its tables in a
  // layout the venue can no longer reach.
  const adoptable = await prisma.floorPlanSetup.findFirst({
    where: { floorPlanId, deletedAt: null, calendarEventId: null, eventDate: null },
    orderBy: { createdAt: 'asc' },
  })
  if (adoptable) {
    return prisma.floorPlanSetup.update({
      where: { id: adoptable.id },
      data: { isDefault: true },
    })
  }

  return prisma.floorPlanSetup.create({
    data: { floorPlanId, name: 'DEFAULT LAYOUT', isDefault: true },
  })
}
