import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayAssignTraining } from '@/lib/worker-guide-access'
import { resolveRetrainRequest } from '@/lib/guide-warnings.server'

// Same transitions as the admin route, from the phone: RESOLVE / DISMISS.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await workerMayAssignTraining(session))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as { action?: string; note?: string | null }
  const status = body.action === 'RESOLVE' ? 'DONE' : body.action === 'DISMISS' ? 'DISMISSED' : null
  if (!status) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const outcome = await resolveRetrainRequest({
    id: params.id,
    venueId: session.venueId,
    status,
    resolvedById: session.staffId,
    note: body.note ?? null,
  })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json(outcome.request)
}
