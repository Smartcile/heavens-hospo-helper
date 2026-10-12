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

function managerCanUse(session: SessionLike, venueId: string): boolean {
  return session.user.role === 'ADMIN' || getAccessibleVenueIds(session).includes(venueId)
}

async function loadFeed(session: SessionLike, req: NextRequest, id: string) {
  const feed = await prisma.calendarFeed.findFirst({ where: { id, deletedAt: null } })
  if (!feed) return { error: NextResponse.json({ error: 'NOT FOUND' }, { status: 404 }) }
  const managerVenue = getManagerVenueId(session, req)
  if (managerVenue && feed.venueId !== managerVenue) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (!managerCanUse(session, feed.venueId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { feed }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadFeed(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { feed } = loaded

  const body = (await req.json().catch(() => null)) as {
    name?: string
    url?: string
    colour?: string | null
    floorPlanId?: string | null
    isActive?: boolean
    notes?: string | null
  } | null
  if (!body) return NextResponse.json({ error: 'INVALID BODY' }, { status: 400 })

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = body.name.trim().toUpperCase()
    if (!name) return NextResponse.json({ error: 'ROOM NAME IS REQUIRED' }, { status: 400 })
    data.name = name
  }

  if (body.url !== undefined) {
    const drafts = expandRoomFeed(body.name?.trim() || feed.name, body.url)
    if (drafts.length !== 1) {
      return NextResponse.json(
        { error: 'A ROOM EDITS ONE CALENDAR — REMOVE IT AND ADD A NEW ROOM FOR MULTI-CALENDAR LINKS' },
        { status: 400 },
      )
    }
    data.url = drafts[0].url
    data.source = drafts[0].source
  }

  if (body.colour !== undefined) data.colour = body.colour?.trim() || null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null
  if (body.isActive !== undefined) data.isActive = !!body.isActive

  if (body.floorPlanId !== undefined) {
    if (body.floorPlanId) {
      const plan = await prisma.floorPlan.findFirst({
        where: { id: body.floorPlanId, venueId: feed.venueId, deletedAt: null },
        select: { id: true },
      })
      if (!plan) return NextResponse.json({ error: 'UNKNOWN FLOOR PLAN' }, { status: 400 })
      data.floorPlanId = body.floorPlanId
    } else {
      data.floorPlanId = null
    }
  }

  const updated = await prisma.calendarFeed.update({ where: { id: feed.id }, data })
  return NextResponse.json({ feed: updated })
}

// Removing a room removes its imported events too — they are the room's
// calendar and would otherwise linger as orphans.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadFeed(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { feed } = loaded

  await prisma.$transaction([
    prisma.calendarEvent.updateMany({
      where: { feedId: feed.id, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
    prisma.calendarFeed.update({
      where: { id: feed.id },
      data: { deletedAt: new Date(), isActive: false },
    }),
  ])

  return NextResponse.json({ success: true })
}
