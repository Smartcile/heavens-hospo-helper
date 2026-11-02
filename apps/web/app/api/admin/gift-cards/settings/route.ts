import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { ensureWooCategory } from '@/lib/woo-categories'
import { fetchWooCategories } from '@/lib/woo-sync'
import { getIntegration } from '@/lib/woo-push'
import { GIFT_CARD_CATEGORY_DEFAULT_NAME } from '@/lib/gift-cards-woo'

// ── Gift card ⇄ WooCommerce category link ─────────────────────────────
// The venue's GIFT CARDS category on the store: purchases in it auto-create
// and auto-issue gift cards, and the WooCommerce plugin attaches their PDFs
// to the order emails. Same contract as the Menus page: '__new__' creates
// (or matches) the category on the store, '' unlinks, an id links verbatim.
// ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : (req.nextUrl.searchParams.get('venueId') || session.user.venueId)

  const venue = await prisma.venue.findUnique({
    where: { id: venueId, deletedAt: null },
    select: { giftCardWooCategoryId: true, giftCardWooCategoryName: true },
  })

  const integration = await getIntegration(venueId)

  return NextResponse.json({
    giftCardCategoryId: venue?.giftCardWooCategoryId ?? null,
    giftCardCategoryName: venue?.giftCardWooCategoryName ?? null,
    hasIntegration: !!integration,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : (body.venueId || session.user.venueId)

  const categoryId = body.categoryId == null ? '' : String(body.categoryId)
  if (categoryId !== '' && categoryId !== '__new__' && !/^\d+$/.test(categoryId)) {
    return NextResponse.json({ error: 'Invalid category id' }, { status: 400 })
  }

  let nextId: string | null = null
  let nextName: string | null = null

  if (categoryId === '__new__') {
    const id = await ensureWooCategory(venueId, GIFT_CARD_CATEGORY_DEFAULT_NAME)
    if (!id) {
      return NextResponse.json(
        { error: 'Category not created — check the WooCommerce integration' },
        { status: 400 },
      )
    }
    nextId = id
    nextName = GIFT_CARD_CATEGORY_DEFAULT_NAME
  } else if (categoryId !== '') {
    // Link verbatim — denormalise the store's name for display.
    nextId = categoryId
    try {
      const integration = await getIntegration(venueId)
      if (integration) {
        const categories = await fetchWooCategories(
          integration.storeUrl,
          integration.consumerKey,
          integration.consumerSecret,
        )
        nextName = categories.find((c) => String(c.id) === categoryId)?.name ?? null
      }
    } catch {
      nextName = null
    }
  }

  await prisma.venue.update({
    where: { id: venueId },
    data: { giftCardWooCategoryId: nextId, giftCardWooCategoryName: nextName },
  })

  return NextResponse.json({
    giftCardCategoryId: nextId,
    giftCardCategoryName: nextName,
  })
}
