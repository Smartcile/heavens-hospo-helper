import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayIssueGiftCards } from '@/lib/worker-gift-access'
import { redeemGiftCard } from '@/lib/gift-card-redemption.server'

/** POST /api/worker/giftcards/[id]/redeem — redeem part or all of the balance. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!(await workerMayIssueGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const result = await redeemGiftCard(session!.venueId, params.id, body?.amount, {
    actor: session!.firstName,
  })
  return NextResponse.json(result.body, { status: result.status })
}
