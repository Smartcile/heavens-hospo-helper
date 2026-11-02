import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { ensureWooCategory } from '@/lib/woo-categories'
import { getIntegration, pushProduct, syncProductVariations } from '@/lib/woo-push'
import { GIFT_CARD_CATEGORY_DEFAULT_NAME, isGiftCardCategorized } from '@/lib/gift-cards-woo'

// â”€â”€ Gift card products (managed from the Gift Cards page) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// A gift card product is a single VARIABLE menu item in the venue's GIFT
// CARDS store category. Its denominations are WooCommerce variations
// ("Size: $50 / $100 / â€¦"), edited from the WOOCOMMERCE SYNC box via PUT
// /api/admin/gift-cards/products/[id] { denominations }.
// Food-facing lists hide these items (see /api/admin/menu-items GET).

const MAX_DENOMINATIONS = 20
const MAX_AMOUNT = 10000
const DEFAULT_DENOMINATIONS = [50, 100, 150]

function validDenominations(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DENOMINATIONS) return null
  const nums = value.map((d) => Math.round(Number(d)))
  if (nums.some((d) => !Number.isFinite(d) || d <= 0 || d > MAX_AMOUNT)) return null
  return [...new Set(nums)]
}

const itemSelect = {
  id: true, name: true, price: true, wooProductId: true, wooCategoryId: true,
  imageUrl: true, isVariable: true, variations: true, shortDescription: true, createdAt: true,
} as const

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const venue = await prisma.venue.findUnique({
    where: { id: session.user.venueId, deletedAt: null },
    select: { giftCardWooCategoryId: true },
  })
  if (!venue?.giftCardWooCategoryId) return NextResponse.json([])

  const items = await prisma.menuItem.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    select: itemSelect,
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(
    items.filter((i) => isGiftCardCategorized(i.wooCategoryId, venue.giftCardWooCategoryId)),
  )
}

/** POST /api/admin/gift-cards/products â€” create the single variable gift card
 *  product (category ensured + linked), then create its denominations as
 *  store variations. Only one variable gift card product per venue. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const name = String(body?.name ?? '').trim() || 'GIFT CARD'
  const denominations = body?.denominations !== undefined
    ? validDenominations(body.denominations)
    : DEFAULT_DENOMINATIONS
  if (!denominations) {
    return NextResponse.json({ error: `Provide 1-${MAX_DENOMINATIONS} denominations between $1 and $${MAX_AMOUNT}` }, { status: 400 })
  }

  const integration = await getIntegration(session.user.venueId)
  if (!integration) {
    return NextResponse.json({ error: 'No active WooCommerce integration for this venue' }, { status: 400 })
  }

  // Ensure the GIFT CARDS category exists (and the venue is linked to it).
  let venue = await prisma.venue.findUnique({
    where: { id: session.user.venueId, deletedAt: null },
    select: { id: true, giftCardWooCategoryId: true, giftCardWooCategoryName: true },
  })
  let categoryId = venue?.giftCardWooCategoryId ?? null
  let categoryName = venue?.giftCardWooCategoryName ?? null
  if (!categoryId) {
    const created = await ensureWooCategory(session.user.venueId, GIFT_CARD_CATEGORY_DEFAULT_NAME)
    if (!created) {
      return NextResponse.json({ error: 'Could not create the GIFT CARDS category â€” check the store connection' }, { status: 400 })
    }
    categoryId = created
    categoryName = GIFT_CARD_CATEGORY_DEFAULT_NAME
    await prisma.venue.update({
      where: { id: session.user.venueId },
      data: { giftCardWooCategoryId: created, giftCardWooCategoryName: GIFT_CARD_CATEGORY_DEFAULT_NAME },
    })
  }

  // One variable product per venue â€” creating again is a no-op guard.
  const existing = await prisma.menuItem.findFirst({
    where: {
      venueId: session.user.venueId, deletedAt: null, isVariable: true,
    },
    select: itemSelect,
  })
  if (existing && isGiftCardCategorized(existing.wooCategoryId, categoryId)) {
    return NextResponse.json({ product: existing, category: { id: categoryId, name: categoryName } })
  }

  let wooProductId: string | null = null
  const max = await prisma.menuItem.findFirst({
    where: { wooProductId: { not: null }, venueId: session.user.venueId, deletedAt: null },
    orderBy: { wooProductId: 'desc' },
    select: { wooProductId: true },
  })
  const maxNum = max?.wooProductId ? parseInt(max.wooProductId, 10) : NaN
  if (!Number.isNaN(maxNum)) wooProductId = String(maxNum + 1)

  const product = await prisma.menuItem.create({
    data: {
      venueId: session.user.venueId,
      name: name.toUpperCase().trim(),
      price: 0, // variable product â€” denominations carry the prices
      wooProductId,
      wooCategoryId: String(categoryId),
      isVariable: true,
      variations: JSON.parse(JSON.stringify(denominations.map((d) => ({ name: `$${d}`, price: d })))),
      shortDescription: 'GIFT CARD â€” PURCHASED ON THE STORE',
    },
    select: itemSelect,
  })

  // Create the product on the store, then reconcile its variations.
  await pushProduct(product.id)
  const synced = await syncProductVariations(product.id, denominations)
  const saved = await prisma.menuItem.findUnique({ where: { id: product.id }, select: itemSelect })

  return NextResponse.json({
    product: saved ?? product,
    category: { id: categoryId, name: categoryName },
    synced: synced.ok,
    syncError: synced.error ?? null,
  }, { status: 201 })
}
