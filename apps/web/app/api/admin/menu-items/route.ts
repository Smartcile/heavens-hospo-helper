import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { pushProduct } from '@/lib/woo-push'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  // Local menu items for this venue
  const local = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    include: { recipe: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })

  // Shared menu items from other venues (via MenuItemVenue)
  const shared = await prisma.menuItemVenue.findMany({
    where: { venueId, isActive: true },
    include: {
      menuItem: {
        include: {
          recipe: { select: { id: true, name: true } },
          venue: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { menuItem: { name: 'asc' } },
  })

  const sharedItems = shared.map((s) => ({
    id: s.menuItem.id,
    name: s.menuItem.name,
    recipeId: s.menuItem.recipeId,
    price: s.menuItem.price,
    wooProductId: s.menuItem.wooProductId,
    wooCategoryId: s.menuItem.wooCategoryId,
    imageUrl: s.menuItem.imageUrl,
    description: s.menuItem.description,
    isActive: s.menuItem.isActive,
    recipe: s.menuItem.recipe,
    sharedFromVenueId: s.menuItem.venueId,
    sharedFromVenueName: s.menuItem.venue.name,
    sharedPriceOverride: s.priceOverride,
    menuItemVenueId: s.id,
  }))

  return NextResponse.json([...local, ...sharedItems])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, recipeId, price, wooProductId: providedWooProductId, wooCategoryId, imageUrl, shortDescription, description, sharedVenueIds, venueId: bodyVenueId } = await req.json()
  if (!name?.trim() || !recipeId) {
    return NextResponse.json({ error: 'name and recipeId are required' }, { status: 400 })
  }

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)

  // Auto-generate wooProductId as max existing + 1 when not provided
  let wooProductId = providedWooProductId || null
  if (!wooProductId) {
    const max = await prisma.menuItem.findFirst({
      where: { wooProductId: { not: null }, venueId, deletedAt: null },
      orderBy: { wooProductId: 'desc' },
      select: { wooProductId: true },
    })
    if (max?.wooProductId) {
      const num = parseInt(max.wooProductId, 10)
      if (!isNaN(num)) wooProductId = String(num + 1)
    }
  }

  const item = await prisma.menuItem.create({
    data: {
      venueId,
      name: name.toUpperCase().trim(),
      recipeId,
      price: parseFloat(String(price)) || 0,
      wooProductId,
      wooCategoryId: wooCategoryId || null,
      imageUrl: imageUrl || null,
      shortDescription: shortDescription || null,
      isVariable: false,
      description: description || null,
    },
    include: { recipe: { select: { id: true, name: true } } },
  })

  // Share to other venues
  if (Array.isArray(sharedVenueIds) && sharedVenueIds.length > 0) {
    await prisma.menuItemVenue.createMany({
      data: sharedVenueIds.map((venueId: string) => ({
        menuItemId: item.id,
        venueId,
      })),
    })
  }

  // Push to WooCommerce (best-effort — logs to SyncLog, never throws)
  await pushProduct(item.id)

  return NextResponse.json(item, { status: 201 })
}
