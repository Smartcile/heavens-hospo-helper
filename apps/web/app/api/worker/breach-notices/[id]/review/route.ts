import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerBreachAccess } from '@/lib/worker-breach-access'
import { reviewBreachNotice } from '@/lib/breach-notices.server'

type Params = { params: { id: string } }

/** POST /api/worker/breach-notices/[id]/review — WAIVE / DECLINE / MARK PAID. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await workerBreachAccess(session)
  if (!access.canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const result = await reviewBreachNotice({
    id: params.id,
    venueId: session.venueId,
    reviewedById: session.staffId,
    action: body.action,
    note: typeof body.note === 'string' ? body.note : null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ notice: result.notice })
}
