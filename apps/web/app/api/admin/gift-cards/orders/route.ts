import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { categoryIdsFromString } from '@/lib/gift-cards-woo'

/**
 * GET /api/admin/gift-cards/orders — every SYNCED order (any status) that
 * carries gift-card lines, with a line breakdown and its linked card(s).
 * The "how is it linked" view behind the Gift Cards page's ORDERS tab.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const venue = await prisma.venue.findUnique({
    where: { id: session.user.venueId, deletedAt: null },
    select: { giftCardWooCategoryId: true },
  })
  const giftCat = venue?.giftCardWooCategoryId
  if (!giftCat) return NextResponse.json({ orders: [] })

  const orders = await prisma.wooOrder.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true, wooOrderId: true, orderNumber: true, status: true, opStatus: true,
      paymentStatus: true, customerName: true, totalAmount: true, createdAt: true,
      serviceDate: true, serviceTime: true,
      items: {
        select: {
          productName: true, qty: true, unitPrice: true,
          menuItem: { select: { wooCategoryId: true } },
        },
      },
    },
  })

  const withGift = orders
    .map((o) => {
      const lines = o.items
        .filter((it) => it.menuItem && categoryIdsFromString(it.menuItem.wooCategoryId).includes(String(giftCat)))
        .map((it) => ({
          productName: it.productName,
          qty: it.qty ?? 0,
          unitPrice: Math.round((it.unitPrice ?? 0) * 100) / 100,
        }))
      if (lines.length === 0) return null
      const giftQty = lines.reduce((s, l) => s + l.qty, 0)
      const giftTotal = Math.round(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100
      return {
        id: o.id,
        wooOrderId: o.wooOrderId,
        orderNumber: o.orderNumber,
        status: o.status,
        opStatus: o.opStatus,
        paymentStatus: o.paymentStatus,
        customerName: o.customerName,
        totalAmount: o.totalAmount,
        createdAt: o.createdAt.toISOString(),
        serviceDate: o.serviceDate ? String(o.serviceDate).slice(0, 10) : null,
        serviceTime: o.serviceTime,
        lines,
        giftQty,
        giftTotal,
        cards: [] as { id: string; number: string; status: string }[],
      }
    })
    .filter((o): o is NonNullable<typeof o> => o !== null)

  // Linked cards (one per order by design, but keep it general).
  const localIds = withGift.map((o) => o.id)
  if (localIds.length > 0) {
    const cards = await prisma.giftCard.findMany({
      where: { venueId: session.user.venueId, wooOrderId: { in: localIds }, deletedAt: null },
      select: { id: true, number: true, status: true, wooOrderId: true },
    })
    for (const o of withGift) {
      o.cards = cards.filter((c) => c.wooOrderId === o.id)
    }
  }

  return NextResponse.json({ orders: withGift })
}
