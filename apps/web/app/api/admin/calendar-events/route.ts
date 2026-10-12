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

function canUseVenue(session: SessionLike, venueId: string): boolean {
  if (session.user.role === 'ADMIN') return true
  return getAccessibleVenueIds(session).includes(venueId)
}

// Create a manual event on the venue calendar — the lightweight "space booking"
// (title/description/area/date/time/pax/PDF + required staff lines). It appears
// on the planner and the roster, and its staffing lines can be listed as
// claimable shifts via the roster's FIND STAFF flow.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    venueId?: string
    title?: string
    description?: string | null
    areaId?: string | null
    date?: string
    startTime?: string
    endTime?: string | null
    allDay?: boolean
    pax?: number | string | null
    pdfUrl?: string | null
    staffing?: unknown
  } | null

  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!canUseVenue(session, venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = validateManualEvent(body ?? {})
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const fields = parsed.value

  let area: { id: string; name: string; floorPlan: { slug: string; name: string } | null } | null = null
  if (fields.areaId) {
    area = await prisma.area.findFirst({
      where: { id: fields.areaId, venueId, deletedAt: null },
      select: { id: true, name: true, floorPlan: { select: { slug: true, name: true } } },
    })
    if (!area) return NextResponse.json({ error: 'UNKNOWN AREA' }, { status: 400 })
  }

  const event = await prisma.calendarEvent.create({
    data: {
      venueId,
      source: 'MANUAL',
      uid: `manual-${crypto.randomUUID()}`,
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

  if (Array.isArray(body?.staffing) && body.staffing.length > 0) {
    const staffing = await saveEventStaffing({ venueId, calendarEventId: event.id, lines: body.staffing })
    if (!staffing.ok) {
      // A bad requirement line must not leave a half-created event behind.
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { deletedAt: new Date() } })
      return NextResponse.json({ error: staffing.error }, { status: staffing.status ?? 400 })
    }
  }

  return NextResponse.json({ event }, { status: 201 })
}
