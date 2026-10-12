import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function managerCanUse(session: SessionLike, venueId: string): boolean {
  return session.user.role === 'ADMIN' || getAccessibleVenueIds(session).includes(venueId)
}

async function loadArea(session: SessionLike, req: NextRequest, id: string) {
  const area = await prisma.area.findFirst({ where: { id, deletedAt: null } })
  if (!area) return { error: NextResponse.json({ error: 'NOT FOUND' }, { status: 404 }) }
  const managerVenue = getManagerVenueId(session, req)
  if (managerVenue && area.venueId !== managerVenue) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (!managerCanUse(session, area.venueId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { area }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const loaded = await loadArea(session, req, params.id)
  if ('error' in loaded) return loaded.error

  const area = await prisma.area.findUnique({
    where: { id: params.id },
    include: {
      floorPlan: { select: { id: true, slug: true, name: true } },
      feeds: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, url: true, source: true, isActive: true, lastSyncedAt: true },
      },
    },
  })
  return NextResponse.json({ area })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadArea(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { area } = loaded

  const body = (await req.json().catch(() => null)) as {
    name?: string
    colour?: string | null
    floorPlanId?: string | null
    capacity?: number | string | null
    isActive?: boolean
    notes?: string | null
  } | null
  if (!body) return NextResponse.json({ error: 'INVALID BODY' }, { status: 400 })

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = body.name.trim().toUpperCase()
    if (!name) return NextResponse.json({ error: 'AREA NAME IS REQUIRED' }, { status: 400 })
    data.name = name
  }

  if (body.capacity !== undefined) {
    const blank = body.capacity === null || String(body.capacity).trim() === ''
    const capacity = blank ? null : Number(body.capacity)
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0)) {
      return NextResponse.json({ error: 'CAPACITY MUST BE A WHOLE NUMBER' }, { status: 400 })
    }
    data.capacity = capacity
  }

  if (body.colour !== undefined) data.colour = body.colour?.trim() || null
  if (body.notes !== undefined) data.notes = body.notes?.trim() || null
  if (body.isActive !== undefined) data.isActive = !!body.isActive

  if (body.floorPlanId !== undefined) {
    if (body.floorPlanId) {
      const plan = await prisma.floorPlan.findFirst({
        where: { id: body.floorPlanId, venueId: area.venueId, deletedAt: null },
        select: { id: true },
      })
      if (!plan) return NextResponse.json({ error: 'UNKNOWN FLOOR PLAN' }, { status: 400 })
      data.floorPlanId = body.floorPlanId
    } else {
      data.floorPlanId = null
    }
  }

  const updated = await prisma.area.update({ where: { id: area.id }, data })
  return NextResponse.json({ area: updated })
}

// Removing an area keeps its calendars alive: they stay as standalone
// (unassigned) feeds and keep syncing, and its events fall back to LOCATION /
// floor-plan matching on the roster.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadArea(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { area } = loaded

  await prisma.$transaction([
    prisma.calendarFeed.updateMany({
      where: { areaId: area.id, deletedAt: null },
      data: { areaId: null },
    }),
    prisma.calendarEvent.updateMany({
      where: { areaId: area.id, deletedAt: null },
      data: { areaId: null },
    }),
    prisma.area.update({
      where: { id: area.id },
      data: { deletedAt: new Date(), isActive: false },
    }),
  ])

  return NextResponse.json({ success: true })
}
