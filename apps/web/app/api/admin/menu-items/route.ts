import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { isGiftCardCategorized } from '@/lib/gift-cards-woo'
import { optionGroupInclude } from '@/lib/menu-lines.server'
import { inheritedAllergensFromRecipe } from '@/lib/menu-item-allergens'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  // Local menu items for this venue
  const local = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    include: {
      recipe: {
        select: {
          id: true, name: true,
          lineItems: {
            select: {
              inventoryItem: { select: { id: true, name: true, allergyInfo: true } },
              childRecipe: { select: { id: true, name: true } },
            },
          },
        },
      },
      optionGroups: optionGroupInclude,
    },
    orderBy: { name: 'asc' },
  })

  // Shared menu items from other venues (via MenuItemVenue)
  const shared = await prisma.menuItemVenue.findMany({
    where: { venueId, isActive: true },
    include: {
      menuItem: {
        include: {
          recipe: {
        select: {
          id: true, name: true,
          lineItems: {
            select: {
              inventoryItem: { select: { id: true, name: true, allergyInfo: true } },
              childRecipe: { select: { id: true, name: true } },
            },
          },
        },
      },
          venue: { select: { id: true, name: true } },
          optionGroups: optionGroupInclude,
        },
      },
    },
    orderBy: { menuItem: { name: 'asc' } },
  })

  // Gift card products (items in the venue's GIFT CARDS category) are managed
  // on the Gift Cards page only — keep them out of the food-facing lists
  // (recipes/menus/order pickers). Shared items are judged against their
  // SOURCE venue's gift category.
  const venueIds = [...new Set([venueId, ...shared.map((s) => s.menuItem.venueId)])]
  const venueRows = await prisma.venue.findMany({
    where: { id: { in: venueIds } },
    select: { id: true, giftCardWooCategoryId: true },
  })
  const giftCategoryByVenue = new Map(venueRows.map((v) => [v.id, v.giftCardWooCategoryId]))
  const isFoodItem = (itemVenueId: string, wooCategoryId: string | null) =>
    !isGiftCardCategorized(wooCategoryId, giftCategoryByVenue.get(itemVenueId))

  const sharedItems = shared
    .filter((s) => isFoodItem(s.menuItem.venueId, s.menuItem.wooCategoryId))
    .map((s) => ({
      id: s.menuItem.id,
      name: s.menuItem.name,
      recipeId: s.menuItem.recipeId,
      price: s.menuItem.price,
      wooProductId: s.menuItem.wooProductId,
      wooCategoryId: s.menuItem.wooCategoryId,
      imageUrl: s.menuItem.imageUrl,
      shortDescription: s.menuItem.shortDescription,
      description: s.menuItem.description,
      dietaryInfo: s.menuItem.dietaryInfo,
      swiftPosId: s.menuItem.swiftPosId,
      tastingNotes: s.menuItem.tastingNotes,
      vintage: s.menuItem.vintage,
      howToServe: s.menuItem.howToServe,
      pricingMode: s.menuItem.pricingMode,
      servesMin: s.menuItem.servesMin,
      servesMax: s.menuItem.servesMax,
      minQty: s.menuItem.minQty,
      leadTimeDays: s.menuItem.leadTimeDays,
      optionGroups: s.menuItem.optionGroups,
      isActive: s.menuItem.isActive,
      recipe: s.menuItem.recipe,
      recipeAllergens: inheritedAllergensFromRecipe(s.menuItem.recipe),
      sharedFromVenueId: s.menuItem.venueId,
      sharedFromVenueName: s.menuItem.venue.name,
      sharedPriceOverride: s.priceOverride,
      menuItemVenueId: s.id,
    }))

  const localItems = local
    .filter((l) => isFoodItem(l.venueId, l.wooCategoryId))
    .map((item) => ({ ...item, recipeAllergens: inheritedAllergensFromRecipe(item.recipe) }))

  return NextResponse.json([...localItems, ...sharedItems])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.create')
  if (denied) return denied

  const {
    name,
    recipeId,
    price,
    wooProductId: providedWooProductId,
    wooCategoryId,
    imageUrl,
    shortDescription,
    description,
    dietaryInfo,
    isVariable,
    variations,
    sharedVenueIds,
    venueId: bodyVenueId,
    pricingMode,
    servesMin,
    servesMax,
    minQty,
    leadTimeDays,
  } = await req.json()
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const serveMin = toIntOrNull(servesMin)
  const serveMax = toIntOrNull(servesMax)
  if ([servesMin, servesMax, minQty, leadTimeDays].some(isNegativeNumber)) {
    return NextResponse.json({ error: 'PRICING VALUES CANNOT BE NEGATIVE' }, { status: 400 })
  }
  if (serveMin != null && serveMax != null && serveMax < serveMin) {
    return NextResponse.json({ error: 'servesMax cannot be less than servesMin' }, { status: 400 })
  }

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)

  if (recipeId) {
    const recipe = await prisma.recipe.count({ where: { id: recipeId, venueId, deletedAt: null } })
    if (recipe !== 1) return NextResponse.json({ error: 'RECIPE IS NOT IN THIS VENUE' }, { status: 400 })
  }

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
      recipeId: recipeId || null,
      price: parseFloat(String(price)) || 0,
      wooProductId,
      wooCategoryId: wooCategoryId || null,
      imageUrl: imageUrl || null,
      shortDescription: shortDescription || null,
      isVariable: !!isVariable,
      variations: variations || null,
      description: description || null,
      dietaryInfo: dietaryInfo || null,
      pricingMode: productPricingMode(pricingMode),
      servesMin: serveMin,
      servesMax: serveMax,
      minQty: toIntOrNull(minQty),
      leadTimeDays: toIntOrNull(leadTimeDays),
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

  return NextResponse.json(item, { status: 201 })
}

/** Product-level pricing mode: EACH (the default) / PER_PERSON / PER_PLATTER. */
function productPricingMode(v: unknown): string | null {
  const raw = String(v ?? '').trim().toUpperCase()
  if (!raw || raw === 'EACH') return null
  return raw === 'PER_PERSON' || raw === 'PER_PLATTER' ? raw : null
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseInt(String(v), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** A supplied numeric pricing field that is negative must be rejected, not nulled. */
function isNegativeNumber(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false
  const n = Number(v)
  return Number.isFinite(n) && n < 0
}
