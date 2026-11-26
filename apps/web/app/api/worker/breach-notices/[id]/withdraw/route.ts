import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerBreachAccess } from '@/lib/worker-breach-access'
import { withdrawBreachNotice } from '@/lib/breach-notices.server'

type Params = { params: { id: string } }

/** POST /api/worker/breach-notices/[id]/withdraw — keep the audit row. */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerBreachAccess(session)
  if (!access.allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await withdrawBreachNotice({
    id: params.id,
    venueId: session.venueId,
    staffId: session.staffId,
    allowAny: access.canReview,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ notice: result.notice })
}
