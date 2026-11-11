import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayAssignTraining } from '@/lib/worker-guide-access'
import { createRetrainRequests } from '@/lib/guide-warnings.server'

// Workers with the TRAINING / PLAYBOOK → ASSIGN grant (and every manager/admin)
// can mark someone for retraining from the phone. Venue is always the session
// venue — a worker cannot write into another venue.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await workerMayAssignTraining(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as {
    staffId?: string
    guideIds?: string[]
    reason?: string | null
  }
  if (!body.staffId) return NextResponse.json({ error: 'STAFF IS REQUIRED' }, { status: 400 })

  const outcome = await createRetrainRequests({
    venueId: session.venueId,
    staffId: body.staffId,
    guideIds: Array.isArray(body.guideIds) ? body.guideIds : [],
    reason: body.reason ?? null,
    requestedById: session.staffId,
  })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }
  return NextResponse.json(outcome.result, { status: 201 })
}
