import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { EVENT_STATUS_VALUES, buildEventData, eventInclude } from '@/lib/events.server'

/** GET /api/admin/events — list events for a venue, optionally date/status filtered. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.view')
  if (denied) return denied

  const params = new URL(req.url).searchParams
  const venueId = params.get('venueId')
  const status = params.get('status')
  const from = params.get('from')
  const to = params.get('to')
  const q = params.get('q')

  const events = await prisma.event.findMany({
    where: {
      deletedAt: null,
      ...(venueId ? { venueId } : {}),
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
      ...(status && (EVENT_STATUS_VALUES as readonly string[]).includes(status)
        ? { status: status as (typeof EVENT_STATUS_VALUES)[number] }
        : {}),
      ...(from || to
        ? {
            eventDate: {
              ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
              ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
            },
          }
        : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    include: {
      customer: { select: { id: true, name: true } },
      menu: { select: { id: true, name: true } },
      setup: { select: { id: true, name: true } },
      blocks: {
        where: { deletedAt: null },
        select: { id: true, type: true, title: true, config: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      },
      _count: { select: { changeRequests: { where: { status: 'PENDING', deletedAt: null } } } },
    },
    orderBy: [{ eventDate: 'desc' }, { startTime: 'asc' }],
  })

  return NextResponse.json(events)
}

/** POST /api/admin/events — create an event. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.create')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const venueId = typeof body.venueId === 'string' ? body.venueId : undefined
  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) return NextResponse.json({ error: 'Venue is required' }, { status: 400 })

  const { data, error } = buildEventData(body)
  if (error) return NextResponse.json({ error }, { status: 400 })
  if (!data.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!data.eventDate) return NextResponse.json({ error: 'Event date is required' }, { status: 400 })

  const event = await prisma.event.create({
    data: {
      ...(data as Prisma.EventUncheckedCreateInput),
      venueId: scopedVenueId,
      history: [
        { at: new Date().toISOString(), type: 'CREATED', note: 'EVENT CREATED' },
      ] as Prisma.InputJsonValue,
    },
    include: eventInclude,
  })

  return NextResponse.json(event, { status: 201 })
}
