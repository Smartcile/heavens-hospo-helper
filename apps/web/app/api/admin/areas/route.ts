import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { expandRoomFeed } from '@/lib/calendar-feeds'

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function canUseVenue(session: SessionLike, venueId: string): boolean {
  if (session.user.role === 'ADMIN') return true
  return getAccessibleVenueIds(session).includes(venueId)
}

async function payloadFor(venueId: string) {
  const [areas, floorPlans, unassignedFeeds] = await Promise.all([
    prisma.area.findMany({
      where: { venueId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        floorPlan: { select: { id: true, slug: true, name: true } },
        feeds: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            url: true,
            source: true,
            isActive: true,
            lastSyncedAt: true,
          },
        },
      },
    }),
    prisma.floorPlan.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true, slug: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    }),
    prisma.calendarFeed.findMany({
      where: { venueId, deletedAt: null, areaId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, url: true, source: true, isActive: true, lastSyncedAt: true },
    }),
  ])
  return { venueId, areas, floorPlans, unassignedFeeds }
}

// Venue areas — created in Venue Setup. An area may have zero or more calendar
// feeds attached; imported events and manual events both resolve to an area,
// and the roster/calendar group by it.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const venueId = getManagerVenueId(session, req) ?? new URL(req.url).searchParams.get('venueId') ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(await payloadFor(venueId))
}

// Create an area. A calendar URL is optional — with one, the same
// expand/validate rules as room feeds apply and the created feeds are linked
// straight to the new area.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    venueId?: string
    name?: string
    colour?: string | null
    floorPlanId?: string | null
    capacity?: number | string | null
    notes?: string | null
    url?: string | null
  } | null

  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const name = (body?.name ?? '').trim().toUpperCase()
  if (!name) return NextResponse.json({ error: 'AREA NAME IS REQUIRED' }, { status: 400 })

  const capacity = body?.capacity === null || body?.capacity === undefined || String(body.capacity).trim() === ''
    ? null
    : Number(body.capacity)
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
    return NextResponse.json({ error: 'CAPACITY MUST BE A WHOLE NUMBER' }, { status: 400 })
  }

  const url = (body?.url ?? '').trim()
  const drafts = url ? expandRoomFeed(name, url) : []
  if (url && drafts.length === 0) {
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

  const last = await prisma.area.findFirst({
    where: { venueId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  const sortOrder = (last?.sortOrder ?? -1) + 1

  const area = await prisma.$transaction(async (tx) => {
    const created = await tx.area.create({
      data: {
        venueId,
        name,
        colour: body?.colour?.trim() || null,
        floorPlanId: body?.floorPlanId || null,
        capacity,
        notes: body?.notes?.trim() || null,
        sortOrder,
      },
    })
    for (const draft of drafts) {
      await tx.calendarFeed.create({
        data: {
          venueId,
          areaId: created.id,
          name: draft.name,
          url: draft.url,
          source: draft.source,
          colour: created.colour,
          floorPlanId: created.floorPlanId,
          sortOrder: 0,
        },
      })
    }
    return created
  })

  return NextResponse.json({ area }, { status: 201 })
}
