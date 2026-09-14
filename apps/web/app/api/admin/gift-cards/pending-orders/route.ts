import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { categoryIdsFromString } from '@/lib/gift-cards-woo'
import { fetchWooOrdersByStatus } from '@/lib/woo-orders-sync'

interface GiftLine {
  name: string
  qty: number
  unitPrice: number
}

/**
 * GET /api/admin/gift-cards/pending-orders
 * Live from the store — no sync required. Every order in pending/on-hold/
 * processing that has gift-card lines and NO `date_paid` yet. Static until
 * CONFIRM PAYMENT is pressed.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const venueId = session.user.venueId
  const venue = await prisma.venue.findUnique({
    where: { id: venueId, deletedAt: null },
    select: { giftCardWooCategoryId: true, sharedWooVenueId: true },
  })
  const giftCat = venue?.giftCardWooCategoryId
  if (!giftCat) return NextResponse.json({ orders: [] })

  const integration = await prisma.wooIntegration.findFirst({
    where: {
      venueId: venue?.sharedWooVenueId ?? venueId,
      isActive: true,
      deletedAt: null,
      venue: { isDemo: false },
    },
    select: { storeUrl: true, consumerKey: true, consumerSecret: true },
  })
  if (!integration) return NextResponse.json({ orders: [] })

  // The two statuses a cash order sits in before it's marked paid, plus
  // `processing` orders that never got a `date_paid` (older COD default).
  const storeOrders: any[] = []
  for (const status of ['pending', 'on-hold', 'processing']) {
    try {
      storeOrders.push(...(await fetchWooOrdersByStatus(integration.storeUrl, integration.consumerKey, integration.consumerSecret, status)))
    } catch {
      // A failed status fetch shouldn't kill the whole list.
    }
  }

  // Resolve local menu items for category matching (variation → parent).
  const productIds = new Set<string>()
  for (const o of storeOrders) {
    for (const li of o.line_items ?? []) {
      if (li.product_id) productIds.add(String(li.product_id))
      if (li.variation_id) productIds.add(String(li.variation_id))
    }
  }
  const menuItems = await prisma.menuItem.findMany({
    where: { venueId, wooProductId: { in: [...productIds] }, deletedAt: null },
    select: { wooProductId: true, wooCategoryId: true },
  })
  const byWooId = new Map(menuItems.map((m) => [m.wooProductId, m]))
  const inGiftCat = (productId: number | null | undefined, variationId: number | null | undefined) => {
    const row = byWooId.get(String(variationId ?? '')) ?? byWooId.get(String(productId ?? ''))
    return row ? categoryIdsFromString(row.wooCategoryId).includes(String(giftCat)) : false
  }

  const orders: {
    wooOrderId: string
    number: string | null
    status: string
    createdAt: string
    customerName: string | null
    totalAmount: number
    paymentMethodTitle: string | null
    giftTotal: number
    giftQty: number
    giftLines: GiftLine[]
  }[] = []

  for (const o of storeOrders) {
    if (o.date_paid) continue // already paid
    const lines: GiftLine[] = []
    for (const li of o.line_items ?? []) {
      if (!inGiftCat(li.product_id, li.variation_id)) continue
      const qty = Number(li.quantity) || 1
      const unit = Number(li.price) || Number(li.total) || 0
      lines.push({ name: String(li.name ?? 'GIFT CARD'), qty, unitPrice: Math.round(unit * 100) / 100 })
    }
    if (lines.length === 0) continue
    const giftTotal = Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100
    const giftQty = lines.reduce((s, l) => s + l.qty, 0)
    orders.push({
      wooOrderId: String(o.id),
      number: o.number ? String(o.number) : null,
      status: String(o.status ?? ''),
      createdAt: o.date_created ? String(o.date_created) : '',
      customerName: o.billing?.first_name ? `${o.billing.first_name} ${o.billing.last_name ?? ''}`.trim() : null,
      totalAmount: Number(o.total) || 0,
      paymentMethodTitle: o.payment_method_title ? String(o.payment_method_title) : null,
      giftTotal,
      giftQty,
      giftLines: lines,
    })
  }

  orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return NextResponse.json({ orders })
}
