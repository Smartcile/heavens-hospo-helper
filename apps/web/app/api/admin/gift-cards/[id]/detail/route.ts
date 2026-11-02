import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import type { GiftCardHistoryEvent } from '@/lib/gift-card-history'

/**
 * GET /api/admin/gift-cards/[id]/detail — the full picture for the card
 * popup: the card (with its lifecycle history), the WooCommerce order it
 * came from (when linked) with its line items, and the store/app sync feed
 * for that order so issues can be traced end to end.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'performance.giftcards.view')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let order: Record<string, unknown> | null = null
  let logs: { id: string; direction: string; status: string; entity: string; message: string; createdAt: string }[] = []

  if (card.wooOrderId) {
    // wooOrderId links to the LOCAL WooOrder row (uuid) — the numeric store
    // id lives on WooOrder.wooOrderId and drives the SyncLog lookup below.
    const orderRow = await prisma.wooOrder.findFirst({
      where: { id: String(card.wooOrderId), venueId: session.user.venueId, deletedAt: null },
      include: {
        items: {
          select: {
            id: true, productName: true, qty: true, unitPrice: true, notes: true,
            customerNote: true, allergenNote: true, kitchenStatus: true,
          },
          orderBy: { createdAt: 'asc' as const },
        },
      },
    })
    if (orderRow) {
      const { items, history, ...rest } = orderRow
      order = { ...rest, items, history: (history as unknown as GiftCardHistoryEvent[]) ?? [] }
      // SyncLog rows for orders are keyed by the STORE's numeric order id —
      // cards link to the local row, so resolve across before the lookup.
      const storeOrderId = String(orderRow.wooOrderId ?? '')
      const syncLogs = storeOrderId
        ? await prisma.syncLog.findMany({
            where: {
              venueId: session.user.venueId,
              entity: 'ORDER',
              externalId: storeOrderId,
              deletedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            take: 80,
            select: { id: true, direction: true, status: true, entity: true, message: true, createdAt: true },
          })
        : []
      logs = syncLogs.map((l) => ({
        id: l.id,
        direction: l.direction as unknown as string,
        status: l.status as unknown as string,
        entity: l.entity as unknown as string,
        message: l.message,
        createdAt: l.createdAt.toISOString(),
      }))
    }
  }

  return NextResponse.json({
    card: {
      ...card,
      history: (card.history as unknown as GiftCardHistoryEvent[]) ?? [],
    },
    order,
    logs,
  })
}
