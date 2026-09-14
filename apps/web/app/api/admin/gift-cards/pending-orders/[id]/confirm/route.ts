import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { pushOrderPaid } from '@/lib/woo-push'
import { runOrderPull, issueGiftCardForOrder } from '@/lib/woo-orders-sync'

/**
 * POST /api/admin/gift-cards/pending-orders/[id]/confirm
 * [id] = the STORE's numeric WooCommerce order id (the pending module lists
 * live from the store, so no local row is required). Confirming a cash order:
 *  1. moves the store order to `completed` (leaves the pending list),
 *  2. pulls so a local row + line items exist,
 *  3. records the payment locally (WooCommerce's REST API cannot set
 *     `date_paid`, so the app is the authority for the confirmation),
 *  4. mints + issues the gift card with its PDF.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const wooOrderId = String(params.id)
  if (!/^\d+$/.test(wooOrderId)) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
  }

  const pushed = await pushOrderPaid(session.user.venueId, wooOrderId)
  if (!pushed.ok) {
    return NextResponse.json({ error: pushed.error ?? 'STORE UPDATE FAILED' }, { status: 400 })
  }

  // Ensure the local row exists with its line items.
  await runOrderPull(session.user.venueId).catch(() => null)

  const local = await prisma.wooOrder.findFirst({
    where: { venueId: session.user.venueId, wooOrderId, deletedAt: null },
    select: { id: true },
  })
  if (!local) {
    return NextResponse.json({ error: 'ORDER COULD NOT BE FOUND AFTER SYNC' }, { status: 400 })
  }

  // Record the payment locally, then issue the card.
  await prisma.wooOrder.update({
    where: { id: local.id },
    data: { paymentStatus: 'PAID', paidAt: new Date(), status: 'COMPLETED', syncedAt: new Date() },
  })
  const issued = await issueGiftCardForOrder(session.user.venueId, local.id)
  if (!issued.issued) {
    return NextResponse.json({ error: issued.error ?? 'CARD NOT ISSUED' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
