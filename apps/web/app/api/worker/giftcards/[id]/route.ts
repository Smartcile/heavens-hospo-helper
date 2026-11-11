import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayIssueGiftCards } from '@/lib/worker-gift-access'
import { prisma } from '@hospo-ops/db'
import { remainingBalance } from '@/lib/gift-card-redemption'
import { GIFT_CARD_PHONE_SELECT } from '@/lib/gift-card-select'

/**
 * GET /api/worker/giftcards/[id] — the full card for the phone detail view:
 * number, amount, remaining balance, status, dates, customer, message and the
 * lifecycle history. Venue-scoped; admin-private notes and internal
 * bookkeeping fields are never returned to the worker app.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!(await workerMayIssueGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session!.venueId, deletedAt: null },
    select: GIFT_CARD_PHONE_SELECT,
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ card, balance: remainingBalance(card) })
}
