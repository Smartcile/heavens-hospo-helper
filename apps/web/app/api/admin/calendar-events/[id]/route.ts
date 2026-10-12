import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'
import { validateManualEvent } from '@/lib/manual-event'
import { saveEventStaffing } from '@/lib/open-shifts.server'

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function managerCanUse(session: SessionLike, venueId: string): boolean {
  return session.user.role === 'ADMIN' || getAccessibleVenueIds(session).includes(venueId)
}

async function loadManualEvent(session: SessionLike, req: NextRequest, id: string) {
  const event = await prisma.calendarEvent.findFirst({ where: { id, deletedAt: null } })
  if (!event) return { error: NextResponse.json({ error: 'NOT FOUND' }, { status: 404 }) }
  const managerVenue = getManagerVenueId(session, req)
  if (managerVenue && event.venueId !== managerVenue) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (!managerCanUse(session, event.venueId)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  if (event.source !== 'MANUAL') {
    return {
      error: NextResponse.json({ error: 'IMPORTED EVENTS ARE READ-ONLY — EDIT THEM IN THE SOURCE CALENDAR' }, { status: 400 }),
    }
  }
  return { event }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const loaded = await loadManualEvent(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { event } = loaded

  const staffing = await prisma.eventStaffing.findMany({
    where: { calendarEventId: event.id, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      positionId: true,
      label: true,
      count: true,
      startTime: true,
      endTime: true,
      breakMinutes: true,
      note: true,
      sortOrder: true,
    },
  })

  return NextResponse.json({ event, staffing })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadManualEvent(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { event } = loaded

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'INVALID BODY' }, { status: 400 })

  const parsed = validateManualEvent({
    title: (body.title as string | undefined) ?? event.title,
    description: (body.description as string | undefined) ?? event.description,
    areaId: body.areaId !== undefined ? (body.areaId as string | null) : event.areaId,
    date: (body.date as string | undefined) ?? event.startsAt.toISOString().slice(0, 10),
    startTime: (body.startTime as string | undefined) ?? formatUtcTime(event.startsAt),
    endTime: body.endTime !== undefined
      ? (body.endTime as string | null)
      : event.endsAt
        ? formatUtcTime(event.endsAt)
        : null,
    allDay: body.allDay !== undefined ? !!body.allDay : event.allDay,
    pax: body.pax !== undefined ? (body.pax as number | string | null) : event.pax,
    pdfUrl: body.pdfUrl !== undefined ? (body.pdfUrl as string | null) : event.pdfUrl,
  })
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const fields = parsed.value

  let area: { id: string; name: string; floorPlan: { slug: string; name: string } | null } | null = null
  if (fields.areaId) {
    area = await prisma.area.findFirst({
      where: { id: fields.areaId, venueId: event.venueId, deletedAt: null },
      select: { id: true, name: true, floorPlan: { select: { slug: true, name: true } } },
    })
    if (!area) return NextResponse.json({ error: 'UNKNOWN AREA' }, { status: 400 })
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: event.id },
    data: {
      title: fields.title,
      description: fields.description,
      location: area?.name ?? null,
      areaId: area?.id ?? null,
      startsAt: fields.startsAt,
      endsAt: fields.endsAt,
      allDay: fields.allDay,
      pax: fields.pax,
      pdfUrl: fields.pdfUrl,
      floorPlanSlug: area?.floorPlan?.slug ?? null,
      floorPlanName: area?.floorPlan?.name ?? null,
    },
  })

  if (Array.isArray(body.staffing)) {
    const staffing = await saveEventStaffing({ venueId: event.venueId, calendarEventId: event.id, lines: body.staffing })
    if (!staffing.ok) return NextResponse.json({ error: staffing.error }, { status: staffing.status ?? 400 })
  }

  return NextResponse.json({ event: updated })
}

// Deleting a manual event pulls its open seats (pending claims declined). A
// seat already filled by a claim keeps its roster shift; that shift stays
// linked historically.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const loaded = await loadManualEvent(session, req, params.id)
  if ('error' in loaded) return loaded.error
  const { event } = loaded

  const now = new Date()
  await prisma.$transaction([
    prisma.openShift.updateMany({
      where: { calendarEventId: event.id, deletedAt: null, status: { not: 'FILLED' } },
      data: { status: 'CANCELLED' },
    }),
    prisma.openShiftClaim.updateMany({
      where: {
        openShift: { calendarEventId: event.id },
        status: 'PENDING',
        deletedAt: null,
      },
      data: { status: 'DECLINED', reviewNote: 'EVENT DELETED', reviewedAt: now },
    }),
    prisma.calendarEvent.update({ where: { id: event.id }, data: { deletedAt: now } }),
  ])

  return NextResponse.json({ success: true })
}

function formatUtcTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}
