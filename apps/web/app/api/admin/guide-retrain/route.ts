import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds, getManagerVenueId } from '@/lib/venue-scope'
import { createRetrainRequests } from '@/lib/guide-warnings.server'

// Mark one or more people-for-guides as needing retraining. Venue-checked; the
// requests land in that person's guide list and the admin warnings queue.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.assign')
  if (denied) return denied

  const body = (await req.json()) as {
    staffId?: string
    guideIds?: string[]
    reason?: string | null
    venueId?: string | null
  }
  if (!body.staffId) return NextResponse.json({ error: 'STAFF IS REQUIRED' }, { status: 400 })

  let venueId: string | null = null
  if (session.user.role === 'MANAGER') {
    venueId = getManagerVenueId(session, req)
  } else {
    const accessible = getAccessibleVenueIds(session)
    const requested = body.venueId?.trim() || null
    if (requested) {
      if (!accessible.includes(requested)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      venueId = requested
    } else {
      // No active venue supplied — derive it from the target person.
      const staff = await prisma.staff.findFirst({
        where: { id: body.staffId, deletedAt: null },
        select: { venueId: true },
      })
      if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })
      if (!accessible.includes(staff.venueId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      venueId = staff.venueId
    }
  }
  if (!venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const outcome = await createRetrainRequests({
    venueId,
    staffId: body.staffId,
    guideIds: Array.isArray(body.guideIds) ? body.guideIds : [],
    reason: body.reason ?? null,
    requestedById: session.user.id,
  })
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status })
  }
  return NextResponse.json(outcome.result, { status: 201 })
}
