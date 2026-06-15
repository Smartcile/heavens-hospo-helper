import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { monthDays, formatDateKey, dateKeysBetween } from '@/lib/calendar'
import { isTaskDueOnDate } from '@/lib/scheduling'

interface DayData {
  shifts: { id: string; staffId: string; staffName: string; departmentName: string | null; startTime: string; endTime: string }[]
  timeOff: { id: string; staffId: string; staffName: string; status: string }[]
  events: { id: string; title: string; time: string | null; allDay: boolean; location: string | null; source: string }[]
  dutiesRequired: boolean
}

function utcTime(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year = Number(searchParams.get('year') ?? now.getUTCFullYear())
  const month = Number(searchParams.get('month') ?? now.getUTCMonth() + 1)
  const venueId = searchParams.get('venueId')

  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  const { first, last, days } = monthDays(year, month)

  const [shifts, timeOff, tasks, events] = await Promise.all([
    prisma.shift.findMany({
      where: { deletedAt: null, date: { gte: first, lte: last }, ...(venueScope ? { venueId: venueScope } : {}) },
      include: {
        staff: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
      },
      orderBy: { startTime: 'asc' },
    }),
    prisma.timeOffRequest.findMany({
      where: {
        deletedAt: null,
        status: { in: ['APPROVED', 'PENDING'] },
        startDate: { lte: last },
        endDate: { gte: first },
        ...(venueScope ? { venueId: venueScope } : {}),
      },
      include: { staff: { select: { firstName: true, lastName: true } } },
    }),
    prisma.task.findMany({
      where: { deletedAt: null, isActive: true, ...(venueScope ? { venueId: venueScope } : {}) },
      select: { scheduleType: true, scheduleDays: true, customCron: true },
    }),
    prisma.calendarEvent.findMany({
      where: {
        deletedAt: null,
        startsAt: { lte: new Date(last.getTime() + 86400000) },
        ...(venueScope ? { venueId: venueScope } : {}),
      },
      orderBy: { startsAt: 'asc' },
    }),
  ])

  // Build empty day map
  const dayMap: Record<string, DayData> = {}
  for (const d of days) {
    dayMap[formatDateKey(d)] = {
      shifts: [],
      timeOff: [],
      events: [],
      dutiesRequired: tasks.some((t) => isTaskDueOnDate(t, d)),
    }
  }

  for (const s of shifts) {
    const key = formatDateKey(s.date)
    dayMap[key]?.shifts.push({
      id: s.id,
      staffId: s.staffId,
      staffName: `${s.staff.firstName} ${s.staff.lastName}`,
      departmentName: s.department?.name ?? null,
      startTime: s.startTime,
      endTime: s.endTime,
    })
  }

  for (const t of timeOff) {
    const name = `${t.staff.firstName} ${t.staff.lastName}`
    for (const key of dateKeysBetween(t.startDate, t.endDate)) {
      if (dayMap[key]) dayMap[key].timeOff.push({ id: t.id, staffId: t.staffId, staffName: name, status: t.status })
    }
  }

  for (const ev of events) {
    // DTEND is exclusive for all-day events — pull the last day back by one.
    let rangeEnd = ev.endsAt ?? ev.startsAt
    if (ev.allDay && ev.endsAt) rangeEnd = new Date(ev.endsAt.getTime() - 86400000)
    if (rangeEnd.getTime() < ev.startsAt.getTime()) rangeEnd = ev.startsAt
    const entry = {
      id: ev.id,
      title: ev.title,
      time: ev.allDay ? null : utcTime(ev.startsAt),
      allDay: ev.allDay,
      location: ev.location,
      source: ev.source,
    }
    for (const key of dateKeysBetween(ev.startsAt, rangeEnd)) {
      if (dayMap[key]) dayMap[key].events.push(entry)
    }
  }

  const pending = timeOff
    .filter((t) => t.status === 'PENDING')
    .map((t) => ({
      id: t.id,
      staffName: `${t.staff.firstName} ${t.staff.lastName}`,
      startDate: t.startDate,
      endDate: t.endDate,
      reason: t.reason,
    }))
    // de-dup (pending appears once per request, not per day)
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)

  const lastSyncedAt = venueScope
    ? (await prisma.venue.findUnique({ where: { id: venueScope }, select: { lastExternalSyncAt: true } }))?.lastExternalSyncAt ?? null
    : null

  return NextResponse.json({ year, month, days: dayMap, pending, lastSyncedAt })
}
