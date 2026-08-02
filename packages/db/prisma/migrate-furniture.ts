/*
 * FURNITURE UNIFICATION MIGRATION
 *
 * A table used to exist three times over:
 *   - InventoryItem (TABLES category) ... what you own, photos, stock count
 *   - TableProfile                     ... dimensions, chairs, numbers, BOM
 *   - FloorPlanElement type TABLE      ... a rectangle drawn on the base plan
 *
 * The first two were joined only by `profiles.find(p => p.name === item.name)`,
 * so renaming either side silently detached stock from geometry. This script
 * folds all three onto InventoryItem, which is now the single source of truth.
 *
 * Idempotent — safe to run on every boot. Each phase re-checks its own state
 * rather than relying on a global "already migrated" flag, so a run that dies
 * halfway resumes cleanly on the next boot.
 *
 * NOTE: this must run AFTER `prisma db push`, because it reads the deprecated
 * TableProfile tables that push keeps alive.
 */
import { prisma, Prisma, ElementType } from '../index'

/** A Json column value that is safe to hand back to Prisma on write. */
function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined
  return value as Prisma.InputJsonValue
}

/** Profile "type" -> the furnitureType we store on the inventory item. */
function furnitureTypeFor(profileType: string | null | undefined): string {
  const t = (profileType ?? 'TABLE').toUpperCase()
  if (t === 'BOOTH' || t === 'BAR' || t === 'CHAIR' || t === 'SOFA') return t
  return 'TABLE'
}

/** Base-plan element types worth rescuing into the default layout. */
const MOVABLE_ELEMENT_TYPES: ElementType[] = [ElementType.TABLE, ElementType.BOOTH_BENCH]

async function tablesCategoryFor(venueId: string): Promise<string> {
  const existing = await prisma.inventoryCategory.findFirst({
    where: { name: 'TABLES', deletedAt: null, OR: [{ venueId }, { venueId: null }] },
    orderBy: { venueId: 'desc' }, // prefer the venue's own over the global one
  })
  if (existing) return existing.id

  const created = await prisma.inventoryCategory.create({
    data: {
      venueId,
      name: 'TABLES',
      tab: 'OTHER',
      isBuiltIn: true,
      showEquipmentFields: true,
    },
  })
  return created.id
}

// ── Phase 1 · TableProfile -> InventoryItem ────────────────────────────────

async function migrateProfiles(): Promise<Map<string, string>> {
  /** profileId -> furniture InventoryItem id */
  const profileToItem = new Map<string, string>()

  const profiles = await prisma.tableProfile.findMany({
    where: { deletedAt: null },
    include: { bomItems: true },
  })

  if (profiles.length === 0) {
    console.log('  no TableProfile rows to migrate')
    return profileToItem
  }

  for (const p of profiles) {
    const categoryId = await tablesCategoryFor(p.venueId)

    // The old UI matched profile <-> item on exact name, so that is the join we
    // honour here. Anything without a partner becomes a new furniture item.
    const match = await prisma.inventoryItem.findFirst({
      where: { venueId: p.venueId, name: p.name, deletedAt: null },
    })

    const geometry = {
      furnitureType: furnitureTypeFor(p.type),
      elementWidth: p.width,
      elementDepth: p.depth,
      elementShape: (p.shape ?? 'RECTANGLE').toUpperCase(),
      defaultColour: p.colour ?? '#e6c347',
      defaultChairCount: p.chairCount ?? 0,
      seatingDensity: p.seatingDensity,
      maxHeadChairs: p.maxHeadChairs ?? 1,
      tableNumbers: json(p.tableNumbers),
    }

    let itemId: string
    if (match) {
      // The profile is the authoritative geometry source — it is what the canvas
      // actually drew. Stock, photos and purchase data on the item are untouched.
      await prisma.inventoryItem.update({ where: { id: match.id }, data: geometry })
      itemId = match.id
    } else {
      const created = await prisma.inventoryItem.create({
        data: {
          venueId: p.venueId,
          categoryId,
          name: p.name,
          unit: 'EA',
          // No stock was ever recorded for this profile. Seed the count from the
          // number pool if it has one, so availability is not silently zero.
          totalQty: Array.isArray(p.tableNumbers) ? (p.tableNumbers as unknown[]).length : 0,
          ...geometry,
        },
      })
      itemId = created.id
    }

    profileToItem.set(p.id, itemId)

    // BOM: TableProfileItem -> FurnitureBomItem
    for (const b of p.bomItems) {
      if (b.inventoryItemId === itemId) continue // a piece can't be its own component
      await prisma.furnitureBomItem.upsert({
        where: {
          furnitureItemId_inventoryItemId: {
            furnitureItemId: itemId,
            inventoryItemId: b.inventoryItemId,
          },
        },
        update: { quantity: b.quantity, perChair: b.perChair },
        create: {
          furnitureItemId: itemId,
          inventoryItemId: b.inventoryItemId,
          quantity: b.quantity,
          perChair: b.perChair,
        },
      })
    }
  }

  console.log(`  migrated ${profiles.length} table profile(s) into inventory`)
  return profileToItem
}

// ── Phase 2 · Rewire placements onto furniture items ───────────────────────

async function rewireSetupItems(profileToItem: Map<string, string>) {
  const stale = await prisma.setupItem.findMany({
    where: { furnitureItemId: null, tableProfileId: { not: null }, deletedAt: null },
    select: { id: true, tableProfileId: true },
  })

  let rewired = 0
  for (const s of stale) {
    const itemId = profileToItem.get(s.tableProfileId!)
    if (!itemId) continue
    await prisma.setupItem.update({ where: { id: s.id }, data: { furnitureItemId: itemId } })
    rewired++
  }
  console.log(`  rewired ${rewired}/${stale.length} placed table(s) onto furniture items`)
}

// ── Phase 3 · Guarantee one default layout per floor plan ──────────────────

async function ensureDefaultSetups(): Promise<Map<string, string>> {
  /** floorPlanId -> default setup id */
  const defaults = new Map<string, string>()

  const plans = await prisma.floorPlan.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      setups: {
        where: { deletedAt: null },
        select: { id: true, isDefault: true, calendarEventId: true, eventDate: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  for (const plan of plans) {
    const alreadyDefault = plan.setups.filter((s) => s.isDefault)

    if (alreadyDefault.length === 1) {
      defaults.set(plan.id, alreadyDefault[0].id)
      continue
    }

    if (alreadyDefault.length > 1) {
      // Only ever one. Keep the first, demote the rest.
      for (const extra of alreadyDefault.slice(1)) {
        await prisma.floorPlanSetup.update({ where: { id: extra.id }, data: { isDefault: false } })
      }
      defaults.set(plan.id, alreadyDefault[0].id)
      continue
    }

    // Promote the oldest everyday layout — one not tied to a calendar event or a
    // specific date, since those are event layouts and must not become the default.
    const everyday = plan.setups.find((s) => !s.calendarEventId && !s.eventDate)
    if (everyday) {
      await prisma.floorPlanSetup.update({ where: { id: everyday.id }, data: { isDefault: true } })
      defaults.set(plan.id, everyday.id)
      continue
    }

    const created = await prisma.floorPlanSetup.create({
      data: { floorPlanId: plan.id, name: 'DEFAULT LAYOUT', isDefault: true },
    })
    defaults.set(plan.id, created.id)
  }

  console.log(`  ensured a default layout on ${defaults.size} floor plan(s)`)
  return defaults
}

// ── Phase 4 · Base-plan tables -> default layout ───────────────────────────

/**
 * The base plan is the building: walls, doors, fixtures. Tables drawn directly
 * on it were a second, parallel way of doing what the layout does — and they
 * were invisible to bookings, auto-seat and the inventory tally. Rescue them
 * into the default layout as real furniture, then soft-delete the elements.
 */
async function liftBasePlanTables(defaults: Map<string, string>) {
  let lifted = 0

  for (const [floorPlanId, setupId] of defaults) {
    const elements = await prisma.floorPlanElement.findMany({
      where: {
        floorPlanId,
        deletedAt: null,
        type: { in: MOVABLE_ELEMENT_TYPES },
      },
    })
    if (elements.length === 0) continue

    const plan = await prisma.floorPlan.findUnique({
      where: { id: floorPlanId },
      select: { venueId: true },
    })
    if (!plan) continue

    const categoryId = await tablesCategoryFor(plan.venueId)

    // Group identical footprints so twelve 120x60 tables become one furniture
    // type with totalQty 12, not twelve one-off types.
    const byFootprint = new Map<string, typeof elements>()
    for (const el of elements) {
      const shape = el.shape === 'CIRCLE' ? 'CIRCLE' : el.shape === 'POLYGON' ? 'POLYGON' : 'RECTANGLE'
      const w = Math.round(el.width)
      const d = Math.round(el.depth)
      const key = `${el.type}|${shape}|${w}x${d}`
      if (!byFootprint.has(key)) byFootprint.set(key, [])
      byFootprint.get(key)!.push(el)
    }

    for (const [key, group] of byFootprint) {
      const first = group[0]
      const shape = first.shape === 'CIRCLE' ? 'CIRCLE' : first.shape === 'POLYGON' ? 'POLYGON' : 'RECTANGLE'
      const w = Math.round(first.width)
      const d = Math.round(first.depth)
      const isBooth = first.type === 'BOOTH_BENCH'
      const name = isBooth ? `BOOTH ${w}×${d}` : shape === 'CIRCLE' ? `ROUND TABLE ${w}` : `TABLE ${w}×${d}`

      let furniture = await prisma.inventoryItem.findFirst({
        where: { venueId: plan.venueId, name, deletedAt: null },
      })

      if (!furniture) {
        furniture = await prisma.inventoryItem.create({
          data: {
            venueId: plan.venueId,
            categoryId,
            name,
            unit: 'EA',
            totalQty: group.length,
            furnitureType: isBooth ? 'BOOTH' : 'TABLE',
            elementWidth: first.width,
            elementDepth: first.depth,
            elementShape: shape,
            elementVertices: json(first.vertices),
            defaultColour: first.fillColour ?? '#e6c347',
            defaultChairCount: first.chairCount ?? 0,
            maxHeadChairs: 1,
          },
        })
      } else if ((furniture.totalQty ?? 0) < group.length) {
        // We can see more of these on the plan than are recorded as owned.
        furniture = await prisma.inventoryItem.update({
          where: { id: furniture.id },
          data: { totalQty: group.length },
        })
      }

      for (const el of group) {
        await prisma.setupItem.create({
          data: {
            setupId,
            furnitureItemId: furniture.id,
            x: el.x,
            y: el.y,
            rotation: el.rotation ?? 0,
            sectionId: el.sectionId,
            label: el.label,
            assignedNumber: el.label,
            sortOrder: el.sortOrder ?? 0,
          },
        })
        lifted++
      }

      console.log(`    ${key} -> "${name}" ×${group.length}`)
    }

    // Soft-delete, never hard-delete — the elements stay recoverable.
    await prisma.floorPlanElement.updateMany({
      where: { id: { in: elements.map((e) => e.id) } },
      data: { deletedAt: new Date() },
    })
  }

  if (lifted > 0) console.log(`  lifted ${lifted} base-plan table(s) into default layouts`)
  else console.log('  no base-plan tables to lift')
}

// ── Phase 5 · Table numbers belong to the default layout ───────────────────

/**
 * Table 12 is a physical spot in the room, so the default layout owns the
 * numbering. Fill in any default-layout table that never got a number, drawing
 * from its furniture's pool and skipping numbers already taken on that layout.
 */
async function numberDefaultLayouts(defaults: Map<string, string>) {
  let numbered = 0

  for (const setupId of defaults.values()) {
    const items = await prisma.setupItem.findMany({
      where: { setupId, deletedAt: null },
      include: { furnitureItem: { select: { id: true, tableNumbers: true } } },
      orderBy: [{ y: 'asc' }, { x: 'asc' }],
    })

    const taken = new Set(items.map((i) => i.assignedNumber).filter(Boolean) as string[])

    for (const item of items) {
      if (item.assignedNumber) continue
      const pool = item.furnitureItem?.tableNumbers
      if (!Array.isArray(pool)) continue

      const free = (pool as unknown[])
        .map(String)
        .sort((a, b) => (Number(a) || 0) - (Number(b) || 0))
        .find((n) => !taken.has(n))
      if (!free) continue

      taken.add(free)
      await prisma.setupItem.update({
        where: { id: item.id },
        data: { assignedNumber: free, label: item.label ?? free },
      })
      numbered++
    }
  }

  if (numbered > 0) console.log(`  assigned ${numbered} table number(s) on default layouts`)
}

// ── Phase 6 · Default chair types ──────────────────────────────────────────

/**
 * Real venues seat people on a handful of standard chairs. Seeding them means
 * the chair picker has something to offer on day one, and chairs draw at a
 * believable size instead of a generic blob.
 *
 * Only seeded for venues that already have furniture — a venue with no tables
 * has no use for chair types yet, and we don't want to litter every venue.
 */
const DEFAULT_CHAIRS = [
  { name: 'DINING CHAIR', width: 45, depth: 45, colour: '#6B6B6B' },
  { name: 'BANQUET CHAIR', width: 43, depth: 43, colour: '#5A5A6B' },
  { name: 'BARSTOOL', width: 38, depth: 38, colour: '#6B5A4A' },
  { name: 'TUB CHAIR', width: 60, depth: 58, colour: '#6B5A5A' },
]

async function seedDefaultChairs() {
  const venues = await prisma.inventoryItem.groupBy({
    by: ['venueId'],
    where: { deletedAt: null, furnitureType: { not: null } },
  })

  let created = 0
  for (const { venueId } of venues) {
    const hasChairs = await prisma.inventoryItem.count({
      where: { venueId, furnitureType: 'CHAIR', deletedAt: null },
    })
    if (hasChairs > 0) continue

    const categoryId = await tablesCategoryFor(venueId)
    for (const chair of DEFAULT_CHAIRS) {
      const exists = await prisma.inventoryItem.findFirst({
        where: { venueId, name: chair.name, deletedAt: null },
      })
      if (exists) continue

      await prisma.inventoryItem.create({
        data: {
          venueId,
          categoryId,
          name: chair.name,
          unit: 'EA',
          totalQty: 0, // the venue fills in how many it actually owns
          furnitureType: 'CHAIR',
          elementWidth: chair.width,
          elementDepth: chair.depth,
          elementShape: 'RECTANGLE',
          defaultColour: chair.colour,
        },
      })
      created++
    }
  }

  if (created > 0) console.log(`  seeded ${created} default chair type(s)`)
  else console.log('  chair types already present')
}

async function main() {
  console.log('=== FURNITURE UNIFICATION MIGRATION ===')
  console.log(`Started: ${new Date().toISOString()}\n`)

  console.log('▸ Phase 1 — table profiles into inventory')
  const profileToItem = await migrateProfiles()

  console.log('▸ Phase 2 — rewiring placed tables')
  await rewireSetupItems(profileToItem)

  console.log('▸ Phase 3 — default layouts')
  const defaults = await ensureDefaultSetups()

  console.log('▸ Phase 4 — lifting base-plan tables')
  await liftBasePlanTables(defaults)

  console.log('▸ Phase 5 — table numbering')
  await numberDefaultLayouts(defaults)

  console.log('▸ Phase 6 — default chair types')
  await seedDefaultChairs()

  console.log('\nFurniture migration complete.')
}

main()
  .catch((e) => {
    console.error('Furniture migration failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
