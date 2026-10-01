import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { keyOfDay } from '@/lib/date-nav'
import { allowedTypes, isDateLocked, isValidAvailabilityTime, minutesOfTime } from '@/lib/availability'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function venueTodayKey(timezone?: string | null): string {
  return formatDateKey(getTodayDate(timezone ?? undefined))
}

// The worker's own availability: employment type (so the UI knows whether they
// opt in or block out), the venue's lock-out setting, and every entry in range.
export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const startKey = url.searchParams.get('start') || keyOfDay(new Date())
  const endKey = url.searchParams.get('end') || startKey
  const start = new Date(`${startKey}T00:00:00Z`)
  const end = new Date(`${endKey}T23:59:59Z`)

  const [staff, venue, entries] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: session.staffId },
      select: { employmentType: true },
    }),
    prisma.venue.findUnique({ where: { id: session.venueId }, select: { availabilityLockDays: true, timezone: true } }),
    prisma.staffAvailability.findMany({
      where: { staffId: session.staffId, deletedAt: null, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    }),
  ])

  return NextResponse.json({
    employmentType: staff?.employmentType ?? null,
    lockDays: venue?.availabilityLockDays ?? 0,
    today: venueTodayKey(venue?.timezone),
    entries: entries.map((e) => ({
      id: e.id,
      date: formatDateKey(e.date),
      type: e.type,
      isAllDay: e.isAllDay,
      startTime: e.startTime,
      endTime: e.endTime,
      notes: e.notes,
    })),
  })
}

// Set the state for one or more days (a repeat-weekly save sends several
// dates). Upsert keeps one row per staff/day, reviving a previously cleared day.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { dates, type, isAllDay, startTime, endTime, notes } = body as {
    dates?: string[]
    type?: string
    isAllDay?: boolean
    startTime?: string | null
    endTime?: string | null
    notes?: string | null
  }

  if (!Array.isArray(dates) || dates.length === 0) {
    return NextResponse.json({ error: 'PICK AT LEAST ONE DAY' }, { status: 400 })
  }
  if (dates.length > 60) {
    return NextResponse.json({ error: 'TOO MANY DAYS AT ONCE (MAX 60)' }, { status: 400 })
  }
  if (dates.some((d) => !DATE_KEY.test(d))) {
    return NextResponse.json({ error: 'INVALID DATE' }, { status: 400 })
  }
  if (type !== 'UNAVAILABLE' && type !== 'PREFERRED') {
    return NextResponse.json({ error: 'INVALID AVAILABILITY TYPE' }, { status: 400 })
  }

  const [staff, venue] = await Promise.all([
    prisma.staff.findUnique({ where: { id: session.staffId }, select: { employmentType: true } }),
    prisma.venue.findUnique({ where: { id: session.venueId }, select: { availabilityLockDays: true, timezone: true } }),
  ])

  if (!allowedTypes(staff?.employmentType).includes(type)) {
    return NextResponse.json({ error: 'THIS EMPLOYMENT TYPE CANNOT SET A PREFERRED DAY' }, { status: 400 })
  }

  const allDay = isAllDay !== false
  let s: string | null = null
  let e: string | null = null
  if (!allDay) {
    if (!startTime || !endTime || !isValidAvailabilityTime(startTime) || !isValidAvailabilityTime(endTime)) {
      return NextResponse.json({ error: 'START AND END TIMES ARE REQUIRED (HH:mm)' }, { status: 400 })
    }
    if (minutesOfTime(endTime) <= minutesOfTime(startTime)) {
      return NextResponse.json({ error: 'END TIME MUST BE AFTER START TIME' }, { status: 400 })
    }
    s = startTime
    e = endTime
  }

  const today = venueTodayKey(venue?.timezone)
  const lockDays = venue?.availabilityLockDays ?? 0
  if (dates.some((d) => isDateLocked(d, lockDays, today))) {
    return NextResponse.json({ error: `AVAILABILITY IS LOCKED WITHIN ${lockDays} DAYS OF TODAY` }, { status: 400 })
  }

  const cleanNotes = notes?.trim() || null
  const results = await Promise.all(
    dates.map((d) =>
      prisma.staffAvailability.upsert({
        where: { staffId_date: { staffId: session.staffId, date: new Date(`${d}T00:00:00Z`) } },
        update: { type, isAllDay: allDay, startTime: s, endTime: e, notes: cleanNotes, deletedAt: null },
        create: {
          staffId: session.staffId,
          venueId: session.venueId,
          date: new Date(`${d}T00:00:00Z`),
          type,
          isAllDay: allDay,
          startTime: s,
          endTime: e,
          notes: cleanNotes,
        },
      }),
    ),
  )

  return NextResponse.json({
    entries: results.map((r) => ({
      id: r.id,
      date: formatDateKey(r.date),
      type: r.type,
      isAllDay: r.isAllDay,
      startTime: r.startTime,
      endTime: r.endTime,
      notes: r.notes,
    })),
  })
}
