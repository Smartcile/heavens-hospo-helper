import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds, getManagerVenueId } from '@/lib/venue-scope'
import { resolveRetrainRequest } from '@/lib/guide-warnings.server'

// RESOLVE = training was redone; DISMISS = manager has acknowledged it. Both
// keep the request row (audit + do not resurface immediately).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.assign')
  if (denied) return denied

  const body = (await req.json()) as { action?: string; note?: string | null; venueId?: string | null }
  const status = body.action === 'RESOLVE' ? 'DONE' : body.action === 'DISMISS' ? 'DISMISSED' : null
  if (!status) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  let venueId: string | null = null
  if (session.user.role === 'MANAGER') {
    venueId = getManagerVenueId(session, req)
  } else {
    const request = await prisma.guideRetrainRequest.findFirst({
      where: { id: params.id, deletedAt: null },
      select: { venueId: true },
    })
    if (!request) return NextResponse.json({ error: 'REQUEST NOT FOUND' }, { status: 404 })
    if (!getAccessibleVenueIds(session).includes(request.venueId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    venueId = request.venueId
  }
  if (!venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const outcome = await resolveRetrainRequest({
    id: params.id,
    venueId,
    status,
    resolvedById: session.user.id,
    note: body.note ?? null,
  })
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  return NextResponse.json(outcome.request)
}
