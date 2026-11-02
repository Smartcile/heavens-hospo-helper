import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { isGiftCardCategorized } from '@/lib/gift-cards-woo'

/**
 * Everything the menu builder can add to a menu, in one call: products
 * (MenuItem, local + shared) and stock items (InventoryItem) for this venue.
 * Guarded by `ops.menus.view` so a menu-only manager never hits an inventory
 * permission wall just to search.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const [local, shared, inventory] = await Promise.all([
    prisma.menuItem.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true, price: true, wooCategoryId: true, imageUrl: true, dietaryInfo: true, isActive: true, variations: true },
      orderBy: { name: 'asc' },
    }),
    prisma.menuItemVenue.findMany({
      where: { venueId, isActive: true },
      include: { menuItem: { select: { id: true, name: true, price: true, wooCategoryId: true, imageUrl: true, dietaryInfo: true, isActive: true, variations: true, venueId: true } } },
    }),
    prisma.inventoryItem.findMany({
      where: { venueId, deletedAt: null, furnitureType: null },
      select: { id: true, name: true, unit: true, category: { select: { name: true, tab: true } } },
      orderBy: { name: 'asc' },
    }),
  ])

  const venueRows = await prisma.venue.findMany({
    where: { id: { in: [...new Set([venueId, ...shared.map((s) => s.menuItem.venueId)])] } },
    select: { id: true, giftCardWooCategoryId: true },
  })
  const giftByVenue = new Map(venueRows.map((v) => [v.id, v.giftCardWooCategoryId]))

  const products = [
    ...local.filter((l) => !isGiftCardCategorized(l.wooCategoryId, giftByVenue.get(venueId))),
    ...shared
      .filter((s) => !isGiftCardCategorized(s.menuItem.wooCategoryId, giftByVenue.get(s.menuItem.venueId)))
      .map((s) => s.menuItem),
  ]

  return NextResponse.json({ products, inventory })
}
