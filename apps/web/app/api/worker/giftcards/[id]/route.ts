import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayIssueGiftCards } from '@/lib/worker-gift-access'
import { prisma } from '@hospo-ops/db'
import { remainingBalance } from '@/lib/gift-card-redemption'

/**
 * GET /api/worker/giftcards/[id] — the full card for the phone detail view:
 * number, amount, remaining balance, status, dates, customer, message and the
 * lifecycle history. Venue-scoped.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!(await workerMayIssueGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session!.venueId, deletedAt: null },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ card, balance: remainingBalance(card) })
}
