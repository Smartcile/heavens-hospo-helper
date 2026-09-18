import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { PUSH_FAILURE_MESSAGES, pushEventToBookings } from '@/lib/event-booking'

type Params = { params: { id: string } }

/** POST /api/admin/events/[id]/push — create/update the booking, seating and pre-order. */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.edit')
  if (denied) return denied

  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    select: { venueId: true },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await pushEventToBookings(params.id, event.venueId)
  if (!result.ok) {
    return NextResponse.json(
      { error: PUSH_FAILURE_MESSAGES[result.reason] ?? 'Could not push this event', reason: result.reason },
      { status: result.reason === 'NOT_FOUND' ? 404 : 400 },
    )
  }
  return NextResponse.json(result)
}
