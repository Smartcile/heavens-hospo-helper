import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { saveEventStaffing } from '@/lib/open-shifts.server'

// Replace an event's required-staff lines (position × count × times).
export async function PUT(req: NextRequest, { params }: { params: { eventId: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    venueId?: string
    lines?: unknown
  } | null
  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (session.user.role !== 'ADMIN' && !getAccessibleVenueIds(session).includes(venueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await saveEventStaffing({
    venueId,
    calendarEventId: params.eventId,
    lines: body?.lines,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ lines: result.lines })
}
