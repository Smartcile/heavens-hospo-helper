import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayAssignTraining } from '@/lib/worker-guide-access'
import { resolveRetrainRequest } from '@/lib/guide-warnings.server'

// Same transitions as the admin route, from the phone: RESOLVE / DISMISS.
// A target worker can always RESOLVE their OWN pending request (they just did
// the retraining); everything else needs the ASSIGN grant.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as { action?: string; note?: string | null }
  const status = body.action === 'RESOLVE' ? 'DONE' : body.action === 'DISMISS' ? 'DISMISSED' : null
  if (!status) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const request = await prisma.guideRetrainRequest.findFirst({
    where: { id: params.id, venueId: session.venueId, deletedAt: null },
    select: { staffId: true },
  })
  if (!request) return NextResponse.json({ error: 'REQUEST NOT FOUND' }, { status: 404 })

  const canAssign = await workerMayAssignTraining(session)
  const ownResolve = body.action === 'RESOLVE' && request.staffId === session.staffId
  if (!canAssign && !ownResolve) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
