import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { cancelOpenShift } from '@/lib/open-shifts.server'

// Pull a listed shift (open seat). Pending claims are declined with a note.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const shift = await prisma.openShift.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { venueId: true },
  })
  if (!shift) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  const managerVenue = getManagerVenueId(session, req)
  if (managerVenue && shift.venueId !== managerVenue) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (session.user.role !== 'ADMIN' && !getAccessibleVenueIds(session).includes(shift.venueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await cancelOpenShift(params.id, shift.venueId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ success: true })
}
