import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'
import { formatDateKey } from '@/lib/scheduling'

// The event roster week payload: the venue's areas, the week's events with
// their required staff + listed (open) shifts + linked roster shifts, the
// venue-wide pending claim queue, and the positions picker data. One round
// trip for the whole grid.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const url = req.nextUrl
  const venueId = getManagerVenueId(session, req) ?? url.searchParams.get('venueId') ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const startKey = url.searchParams.get('start') || formatDateKey(new Date())
  const endKey = url.searchParams.get('end') || startKey
  const start = new Date(`${startKey}T00:00:00Z`)
  const endExclusive = new Date(new Date(`${endKey}T00:00:00Z`).getTime() + 86_400_000)

  const [venue, areas, events, queue, positions] = await Promise.all([
    prisma.venue.findUnique({ where: { id: venueId }, select: { lastExternalSyncAt: true } }),
    prisma.area.findMany({
      where: { venueId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { floorPlan: { select: { slug: true, name: true } } },
    }),
    prisma.calendarEvent.findMany({
      where: {
        venueId,
        deletedAt: null,
        startsAt: { lt: endExclusive },
        OR: [{ endsAt: { gte: start } }, { endsAt: null, startsAt: { gte: start } }],
      },
      orderBy: { startsAt: 'asc' },
      include: {
        feed: { select: { areaId: true } },
        staffing: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: { position: { select: { id: true, name: true, colour: true } } },
        },
        openShifts: {
          where: { deletedAt: null },
          orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
          include: {
            position: { select: { id: true, name: true, colour: true } },
            filledBy: { select: { id: true, firstName: true, lastName: true } },
            claims: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                staffId: true,
                status: true,
                note: true,
                createdAt: true,
                staff: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
        shifts: {
          where: { deletedAt: null },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          include: {
            staff: { select: { id: true, firstName: true, lastName: true } },
            position: { select: { name: true, colour: true } },
          },
        },
      },
    }),
    prisma.openShiftClaim.findMany({
      where: { venueId, status: 'PENDING', deletedAt: null, openShift: { deletedAt: null } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
        openShift: {
          include: {
            position: { select: { id: true, name: true, colour: true } },
            calendarEvent: { select: { id: true, title: true } },
          },
        },
      },
    }),
    prisma.position.findMany({
      where: { venueId, deletedAt: null, isActive: true },
      select: { id: true, name: true, colour: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])

  return NextResponse.json({
    venueId,
    start: startKey,
    end: endKey,
    lastSyncedAt: venue?.lastExternalSyncAt ?? null,
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      colour: a.colour,
      capacity: a.capacity,
      floorPlanSlug: a.floorPlan?.slug ?? null,
      floorPlanName: a.floorPlan?.name ?? null,
    })),
    events: events.map((e) => {
      const filledShiftIds = new Set(e.openShifts.map((o) => o.filledShiftId).filter(Boolean))
      return {
        id: e.id,
        feedId: e.feedId,
        areaId: e.areaId ?? e.feed?.areaId ?? null,
        title: e.title,
        description: e.description,
        location: e.location,
        source: e.source,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt ? e.endsAt.toISOString() : null,
        allDay: e.allDay,
        pax: e.pax,
        pdfPath: e.pdfPath,
        pdfUrl: e.pdfUrl,
        floorPlanSlug: e.floorPlanSlug,
        floorPlanName: e.floorPlanName,
        staffing: e.staffing.map((s) => ({
          id: s.id,
          positionId: s.positionId,
          positionName: s.position?.name ?? null,
          positionColour: s.position?.colour ?? null,
          label: s.label,
          count: s.count,
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
          note: s.note,
          sortOrder: s.sortOrder,
        })),
        openShifts: e.openShifts.map((o) => ({
          id: o.id,
          staffingId: o.staffingId,
          positionId: o.positionId,
          positionName: o.position?.name ?? null,
          positionColour: o.position?.colour ?? null,
          label: o.label,
          date: formatDateKey(o.date),
          startTime: o.startTime,
          endTime: o.endTime,
          breakMinutes: o.breakMinutes,
          note: o.note,
          status: o.status,
          filledById: o.filledById,
          filledByName: o.filledBy ? `${o.filledBy.firstName} ${o.filledBy.lastName}` : null,
          filledShiftId: o.filledShiftId,
          claims: o.claims.map((c) => ({
            id: c.id,
            staffId: c.staffId,
            staffName: `${c.staff.firstName} ${c.staff.lastName}`,
            status: c.status,
            note: c.note,
            createdAt: c.createdAt.toISOString(),
          })),
        })),
        shifts: e.shifts.map((s) => ({
          id: s.id,
          staffId: s.staffId,
          staffName: `${s.staff.firstName} ${s.staff.lastName}`,
          positionName: s.position?.name ?? null,
          positionColour: s.position?.colour ?? null,
          date: formatDateKey(s.date),
          startTime: s.startTime,
          endTime: s.endTime,
          breakMinutes: s.breakMinutes,
          tag: s.tag,
          status: s.status,
          fromClaim: filledShiftIds.has(s.id),
        })),
      }
    }),
    queue: queue.map((c) => ({
      id: c.id,
      openShiftId: c.openShiftId,
      staffId: c.staffId,
      staffName: `${c.staff.firstName} ${c.staff.lastName}`,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
      date: formatDateKey(c.openShift.date),
      startTime: c.openShift.startTime,
      endTime: c.openShift.endTime,
      positionName: c.openShift.position?.name ?? null,
      label: c.openShift.label,
      eventTitle: c.openShift.calendarEvent?.title ?? null,
      eventId: c.openShift.calendarEvent?.id ?? null,
    })),
    positions,
  })
}
