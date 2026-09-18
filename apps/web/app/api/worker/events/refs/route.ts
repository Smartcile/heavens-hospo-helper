import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { isGiftCardCategorized } from '@/lib/gift-cards-woo'

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

  const [menus, items, services, setups, venue] = await Promise.all([
    prisma.menu.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.menuItem.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true, wooCategoryId: true },
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
    prisma.venue.findUnique({ where: { id: venueId }, select: { giftCardWooCategoryId: true } }),
  ])

  // Gift card products are managed on the Gift Cards page only — keep them out
  // of the event menu picker, the same rule the recipes/menus lists follow.
  const menuItems = items
    .filter((i) => !isGiftCardCategorized(i.wooCategoryId, venue?.giftCardWooCategoryId))
    .map((i) => ({ id: i.id, name: i.name }))

  return NextResponse.json({ menus, menuItems, services, setups })
}
