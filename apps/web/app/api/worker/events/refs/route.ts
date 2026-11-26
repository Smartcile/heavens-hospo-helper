import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { isGiftCardCategorized } from '@/lib/gift-cards-woo'
import { loadCustomDefRows } from '@/lib/beo-block-defs.server'
import { menuInclude, shapeMenuLine } from '@/lib/menu-lines.server'

/**
 * GET /api/worker/events/refs — the picker data the worker BEO builder needs
 * (menus, menu items, services, floor plan layouts). The admin equivalents are
 * gated behind ops/floorplans grants, which a floor manager may not hold, so
 * the worker gets its own venue-scoped, event-gated copy.
 */
export async function GET() {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const venueId = session!.venueId

  const [rawMenus, items, services, setups, venue, blockDefs] = await Promise.all([
    prisma.menu.findMany({
      where: { venueId, deletedAt: null },
      include: menuInclude,
      orderBy: { name: 'asc' },
    }),
    prisma.menuItem.findMany({
      where: { venueId, deletedAt: null },
      select: {
        id: true,
        name: true,
        wooCategoryId: true,
        price: true,
        pricingMode: true,
        servesMin: true,
        servesMax: true,
        minQty: true,
        leadTimeDays: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.service.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.floorPlanSetup.findMany({
      where: { deletedAt: null, floorPlan: { venueId, deletedAt: null } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.venue.findUnique({ where: { id: venueId }, select: { giftCardWooCategoryId: true, timezone: true } }),
    loadCustomDefRows(venueId),
  ])

  // Gift card products are managed on the Gift Cards page only — keep them out
  // of the event menu picker, the same rule the recipes/menus lists follow.
  const menuItems = items
    .filter((i) => !isGiftCardCategorized(i.wooCategoryId, venue?.giftCardWooCategoryId))
    .map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      pricingMode: i.pricingMode,
      servesMin: i.servesMin,
      servesMax: i.servesMax,
      minQty: i.minQty,
      leadTimeDays: i.leadTimeDays,
    }))

  // Full menus (groups + shaped lines) so the worker editor can default the
  // pricing unit, author set-menu picks and show the right minimums (#192).
  const menus = rawMenus.map((m) => ({ ...m, items: m.items.map(shapeMenuLine) }))

  return NextResponse.json({
    menus,
    menuItems,
    services,
    setups,
    blockDefs,
    venueTimezone: venue?.timezone ?? null,
  })
}
