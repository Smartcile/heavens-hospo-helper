import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageGiftCards } from '@/lib/worker-gift-access'
import { resetGiftCardToDraft } from '@/lib/gift-cards'

/**
 * POST /api/worker/giftcards/[id]/reset — managers/admins only.
 * Reuse a card with its SAME number: reset it to a blank DRAFT, keeping the
 * full history. Floor staff can redeem but never re-circulate a number.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!(await workerMayManageGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const result = await resetGiftCardToDraft(session!.venueId, params.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.card)
}
