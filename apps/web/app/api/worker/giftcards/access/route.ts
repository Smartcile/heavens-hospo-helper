import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayIssueGiftCards } from '@/lib/worker-gift-access'

/** GET /api/worker/giftcards/access — can this worker issue gift cards? */
export async function GET() {
  const session = await getWorkerSession()
  const allowed = await workerMayIssueGiftCards(session)
  return NextResponse.json({ allowed })
}
