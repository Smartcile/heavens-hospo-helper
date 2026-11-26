import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { formatDateKey } from '@/lib/scheduling'
import { areaWhereForVenues } from '@/lib/area-scope'
import { spaceAvailabilityForDay } from '@/lib/space-availability'

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function canUseVenue(session: SessionLike, venueId: string): boolean {
  if (session.user.role === 'ADMIN') return true
  return getAccessibleVenueIds(session).includes(venueId)
}

// A single room's day: every calendar/BEO event and booking (incl. group and
// section holds, which are bookings) that occupies each room on the day, plus an
// UNASSIGNED bucket. One round trip for the space view.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const venueId = getManagerVenueId(session, req) ?? params.get('venueId') ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const date = params.get('date') || formatDateKey(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A VALID DATE IS REQUIRED' }, { status: 400 })
  }

  const dayStart = new Date(`${date}T00:00:00Z`)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)

  const areaWhere = areaWhereForVenues([venueId])
  const areas = await prisma.area.findMany({
    where: { deletedAt: null, ...areaWhere },
    select: { id: true, name: true, colour: true, venueId: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  const [events, bookings] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        deletedAt: null,
        startsAt: { lt: dayEnd },
        AND: [
          { OR: [{ endsAt: { gte: dayStart } }, { endsAt: null, startsAt: { gte: dayStart } }] },
          { OR: [{ venueId }, { area: { venueLinks: { some: { venueId, deletedAt: null } } } }] },
        ],
      },
      select: {
        id: true,
        title: true,
        areaId: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        pax: true,
        source: true,
      },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: {
        deletedAt: null,
        date: dayStart,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        OR: [
          { venueId },
          { area: { venueLinks: { some: { venueId, deletedAt: null } } } },
        ],
      },
      select: {
        id: true,
        contactName: true,
        areaId: true,
        date: true,
        startTime: true,
        endTime: true,
        partySize: true,
        status: true,
        source: true,
        calendarEventId: true,
      },
      orderBy: { startTime: 'asc' },
    }),
  ])

  const view = spaceAvailabilityForDay({
    date,
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      colour: a.colour,
      ownerVenueId: a.venueId,
      sortOrder: a.sortOrder,
    })),
    events,
    bookings,
  })

  return NextResponse.json(view)
}
