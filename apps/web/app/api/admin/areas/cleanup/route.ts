import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { isHumanRoomName } from '@/lib/room-names'

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function canUseVenue(session: SessionLike, venueId: string): boolean {
  if (session.user.role === 'ADMIN') return true
  return getAccessibleVenueIds(session).includes(venueId)
}

// Rooms created by the old boot migration from calendar identifiers. Listing
// them is what lets an admin clean up without hunting through the room picker.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const venueId =
    getManagerVenueId(session, req) ??
    new URL(req.url).searchParams.get('venueId') ??
    session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const areas = await prisma.area.findMany({
    where: { venueId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      _count: { select: { feeds: true, events: true } },
    },
  })

  const rooms = areas
    .filter((a) => !isHumanRoomName(a.name))
    .map((a) => ({ id: a.id, name: a.name, feedCount: a._count.feeds, eventCount: a._count.events }))

  return NextResponse.json({ venueId, rooms })
}

// REHOME moves the junk room's feeds and events to a real room, then removes
// it. REMOVE leaves the calendars unassigned (and dismissed, so they never
// become a room again).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    venueId?: string
    areaId?: string
    action?: string
    targetAreaId?: string | null
  } | null
  if (!body?.areaId) return NextResponse.json({ error: 'AREA ID IS REQUIRED' }, { status: 400 })

  const venueId = getManagerVenueId(session, req) ?? body.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const area = await prisma.area.findFirst({
    where: { id: body.areaId, venueId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!area) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })

  if (body.action === 'REHOME') {
    if (!body.targetAreaId) return NextResponse.json({ error: 'CHOOSE A ROOM TO MOVE TO' }, { status: 400 })
    if (body.targetAreaId === area.id) {
      return NextResponse.json({ error: 'CHOOSE A DIFFERENT ROOM' }, { status: 400 })
    }
    const target = await prisma.area.findFirst({
      where: { id: body.targetAreaId, venueId, deletedAt: null },
      select: { id: true },
    })
    if (!target) return NextResponse.json({ error: 'UNKNOWN TARGET ROOM' }, { status: 400 })

    const [feeds, events] = await prisma.$transaction([
      prisma.calendarFeed.updateMany({
        where: { areaId: area.id, deletedAt: null },
        data: { areaId: target.id, roomDismissed: false },
      }),
      prisma.calendarEvent.updateMany({
        where: { areaId: area.id, deletedAt: null },
        data: { areaId: target.id },
      }),
      prisma.area.update({ where: { id: area.id }, data: { deletedAt: new Date(), isActive: false } }),
    ])
    return NextResponse.json({
      success: true,
      action: 'REHOME',
      movedFeeds: feeds.count,
      movedEvents: events.count,
    })
  }

  if (body.action === 'REMOVE') {
    await prisma.$transaction([
      prisma.calendarFeed.updateMany({
        where: { areaId: area.id, deletedAt: null },
        data: { areaId: null, roomDismissed: true },
      }),
      prisma.calendarEvent.updateMany({
        where: { areaId: area.id, deletedAt: null },
        data: { areaId: null },
      }),
      prisma.area.update({ where: { id: area.id }, data: { deletedAt: new Date(), isActive: false } }),
    ])
    return NextResponse.json({ success: true, action: 'REMOVE' })
  }

  return NextResponse.json({ error: 'ACTION MUST BE REHOME OR REMOVE' }, { status: 400 })
}
