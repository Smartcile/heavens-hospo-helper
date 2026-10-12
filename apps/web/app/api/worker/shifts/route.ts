import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'
import { formatDateKey } from '@/lib/scheduling'
import { conflictsWithShift } from '@/lib/availability'
import { mapAvailabilityEntry } from '@/lib/availability.server'

const utcDay = (key: string) => new Date(`${key}T00:00:00Z`)

// The open shifts a worker can pick up: only seats for positions they hold
// (or with no role requirement), within the requested range and never in the
// past. Each seat carries an availability-conflict flag so the card can warn.
export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const todayKey = formatDateKey(getTodayDate(venue?.timezone))

  const startKey = url.searchParams.get('start') || todayKey
  const endKey = url.searchParams.get('end') || startKey
  const fromKey = startKey < todayKey ? todayKey : startKey

  const positions = await prisma.staffPosition.findMany({
    where: { staffId: session.staffId },
    select: { positionId: true },
  })
  const positionIds = positions.map((p) => p.positionId)

  const [shifts, claims, availability] = await Promise.all([
    prisma.openShift.findMany({
      where: {
        venueId: session.venueId,
        deletedAt: null,
        status: 'OPEN',
        date: { gte: utcDay(fromKey), lte: utcDay(endKey) },
        OR: [{ positionId: null }, { positionId: { in: positionIds } }],
      },
      include: {
        position: { select: { name: true, colour: true } },
        calendarEvent: { select: { id: true, title: true, location: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 200,
    }),
    prisma.openShiftClaim.findMany({
      where: { staffId: session.staffId, venueId: session.venueId, deletedAt: null },
      include: {
        openShift: {
          include: { position: { select: { name: true, colour: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.staffAvailability.findMany({
      where: {
        staffId: session.staffId,
        deletedAt: null,
        date: { gte: utcDay(fromKey), lte: utcDay(endKey) },
      },
    }),
  ])

  const availabilityByDay = new Map(
    availability.map((row) => [formatDateKey(row.date), mapAvailabilityEntry(row)]),
  )

  return NextResponse.json({
    today: todayKey,
    positionIds,
    shifts: shifts.map((s) => {
      const dateKey = formatDateKey(s.date)
      const entry = availabilityByDay.get(dateKey)
      return {
        id: s.id,
        date: dateKey,
        startTime: s.startTime,
        endTime: s.endTime,
        breakMinutes: s.breakMinutes,
        note: s.note,
        positionId: s.positionId,
        positionName: s.position?.name ?? null,
        positionColour: s.position?.colour ?? null,
        label: s.label,
        eventId: s.calendarEvent?.id ?? null,
        eventTitle: s.calendarEvent?.title ?? null,
        eventLocation: s.calendarEvent?.location ?? null,
        conflicts: entry ? conflictsWithShift(entry, s.startTime, s.endTime) : false,
      }
    }),
    myClaims: claims.map((c) => ({
      id: c.id,
      openShiftId: c.openShiftId,
      status: c.status,
      note: c.note,
      reviewNote: c.reviewNote,
      shiftId: c.shiftId,
      createdAt: c.createdAt.toISOString(),
      date: formatDateKey(c.openShift.date),
      startTime: c.openShift.startTime,
      endTime: c.openShift.endTime,
      positionName: c.openShift.position?.name ?? null,
      label: c.openShift.label,
      openShiftStatus: c.openShift.status,
    })),
  })
}
