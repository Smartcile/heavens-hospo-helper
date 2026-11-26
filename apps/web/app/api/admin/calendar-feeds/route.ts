import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { areaWhereForVenues } from '@/lib/area-scope'
import { expandRoomFeed } from '@/lib/calendar-feeds'

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function canUseVenue(session: SessionLike, venueId: string): boolean {
  if (session.user.role === 'ADMIN') return true
  return getAccessibleVenueIds(session).includes(venueId)
}

// Room calendar feeds for a venue — one row per event space. The Settings →
// Integrations manager reads them here; the event roster groups events by them.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const venueId = getManagerVenueId(session, req) ?? new URL(req.url).searchParams.get('venueId') ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const areas = await prisma.area.findMany({
    where: { deletedAt: null, ...areaWhereForVenues([venueId]) },
    select: {
      id: true,
      venueId: true,
      name: true,
      colour: true,
      capacity: true,
      floorPlanId: true,
      sortOrder: true,
      notes: true,
      venueLinks: {
        where: { deletedAt: null },
        select: { venueId: true, isOwner: true, venue: { select: { id: true, name: true } } },
      },
      _count: { select: { events: { where: { deletedAt: null } } } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  const areaIds = areas.map((a) => a.id)

  const [feeds, floorPlans, venues] = await Promise.all([
    prisma.calendarFeed.findMany({
      // Feeds owned by this venue, plus the calendars of any room shared into it.
      where: {
        deletedAt: null,
        OR: [{ venueId }, ...(areaIds.length > 0 ? [{ areaId: { in: areaIds } }] : [])],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { floorPlan: { select: { id: true, slug: true, name: true } } },
    }),
    prisma.floorPlan.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true, slug: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
    prisma.venue.findMany({
      where: { deletedAt: null, id: { in: getAccessibleVenueIds(session) } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    venueId,
    feeds: feeds.map((f) => ({
      id: f.id,
      areaId: f.areaId,
      name: f.name,
      url: f.url,
      source: f.source,
      colour: f.colour,
      floorPlanId: f.floorPlanId,
      floorPlanName: f.floorPlan?.name ?? null,
      sortOrder: f.sortOrder,
      isActive: f.isActive,
      lastSyncedAt: f.lastSyncedAt,
      notes: f.notes,
      roomDismissed: f.roomDismissed,
    })),
    floorPlans,
    venues,
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      colour: a.colour,
      capacity: a.capacity,
      floorPlanId: a.floorPlanId,
      sortOrder: a.sortOrder,
      notes: a.notes,
      ownerVenueId: a.venueId,
      isOwner: a.venueId === venueId,
      sharedWith: a.venueLinks
        .filter((l) => !l.isOwner && l.venueId !== a.venueId)
        .map((l) => ({ venueId: l.venueId, name: l.venue?.name ?? l.venueId })),
      feedCount: feeds.filter((f) => f.areaId === a.id).length,
      eventCount: a._count.events,
    })),
  })
}

// Add a room. A Google embed link with several `src` calendars creates one
// feed per calendar (named `<ROOM> 1`, `<ROOM> 2`, …).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    venueId?: string
    name?: string
    url?: string
    areaId?: string | null
    colour?: string | null
    floorPlanId?: string | null
    notes?: string | null
  } | null

  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const name = (body?.name ?? '').trim().toUpperCase()
  if (!name) return NextResponse.json({ error: 'ROOM NAME IS REQUIRED' }, { status: 400 })

  // A calendar must say which room it belongs to — or explicitly UNASSIGNED.
  // Omitting the field is an error so a client can never silently create a
  // feed the boot migration would later turn into a room.
  if (body?.areaId === undefined) {
    return NextResponse.json(
      { error: 'CHOOSE A ROOM OR UNASSIGNED — A CALENDAR NEVER CREATES A ROOM' },
      { status: 400 },
    )
  }
  const areaId = (body.areaId ?? '').trim() || null

  const drafts = expandRoomFeed(name, body?.url ?? '')
  if (drafts.length === 0) {
    return NextResponse.json(
      { error: 'UNSUPPORTED LINK — USE A GOOGLE CALENDAR EMBED, AN .ICS URL OR webcal:// LINK' },
      { status: 400 },
    )
  }

  if (body?.floorPlanId) {
    const plan = await prisma.floorPlan.findFirst({
      where: { id: body.floorPlanId, venueId, deletedAt: null },
      select: { id: true },
    })
    if (!plan) return NextResponse.json({ error: 'UNKNOWN FLOOR PLAN' }, { status: 400 })
  }

  if (areaId) {
    const area = await prisma.area.findFirst({
      where: { id: areaId, venueId, deletedAt: null },
      select: { id: true },
    })
    if (!area) return NextResponse.json({ error: 'UNKNOWN AREA' }, { status: 400 })
  }

  const last = await prisma.calendarFeed.findFirst({
    where: { venueId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  let sortOrder = (last?.sortOrder ?? -1) + 1

  const created = await prisma.$transaction(
    drafts.map((draft) =>
      prisma.calendarFeed.create({
        data: {
          venueId,
          areaId,
          // An explicit UNASSIGNED choice must not be re-inferred on boot.
          roomDismissed: areaId === null,
          name: draft.name,
          url: draft.url,
          source: draft.source,
          colour: body?.colour?.trim() || null,
          floorPlanId: body?.floorPlanId || null,
          notes: body?.notes?.trim() || null,
          sortOrder: sortOrder++,
        },
      }),
    ),
  )

  return NextResponse.json({ feeds: created }, { status: 201 })
}
