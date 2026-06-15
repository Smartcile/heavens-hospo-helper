import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { syncVenueCalendar, syncAllVenues } from '@/lib/external-sync'

// POST /api/admin/calendar/sync  { venueId? }
// Pulls external iCal feeds and reconciles them into CalendarEvent.
// Manager → own venue only. Admin → given venue, or all venues if none given.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const role = session.user.role
  const requested: string | undefined = body.venueId || undefined

  if (role === 'MANAGER') {
    const result = await syncVenueCalendar(session.user.venueId)
    return NextResponse.json(result)
  }

  if (role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = requested ? await syncVenueCalendar(requested) : await syncAllVenues()
  return NextResponse.json(result)
}
