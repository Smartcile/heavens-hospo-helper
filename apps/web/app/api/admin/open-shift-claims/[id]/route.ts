import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { reviewOpenShiftClaim } from '@/lib/open-shifts.server'

// Approve (creates the DRAFT roster shift + fills the seat) or decline a
// worker's claim on a listed shift.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.approve')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    action?: 'APPROVE' | 'DECLINE'
    reviewNote?: string | null
  } | null
  if (body?.action !== 'APPROVE' && body?.action !== 'DECLINE') {
    return NextResponse.json({ error: 'action must be APPROVE or DECLINE' }, { status: 400 })
  }

  const claim = await prisma.openShiftClaim.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { venueId: true },
  })
  if (!claim) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  const managerVenue = getManagerVenueId(session, req)
  if (managerVenue && claim.venueId !== managerVenue) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (session.user.role !== 'ADMIN' && !getAccessibleVenueIds(session).includes(claim.venueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await reviewOpenShiftClaim({
    claimId: params.id,
    venueId: claim.venueId,
    actorId: session.user.id ?? null,
    action: body.action,
    reviewNote: body.reviewNote ?? null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ success: true, shiftId: result.shiftId })
}
