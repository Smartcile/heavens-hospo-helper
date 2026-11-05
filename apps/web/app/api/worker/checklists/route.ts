import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { normaliseOutcomes } from '@/lib/task-outcomes'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { validateWorkerTaskRefs } from '@/lib/worker-task-refs.server'
import { getTodayDate } from '@/lib/utils'
import {
  isActivatedOn,
  isChecklistOpen,
  describeNextOpen,
  weekdayOf,
  summariseCalendarEvent,
  validateSchedules,
} from '@/lib/checklist-activation'
import {
  parseEventIds,
  syncChecklistEvents,
  validateChecklistEventIds,
} from '@/lib/checklist-events.server'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canAuthor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [checklists, venue] = await Promise.all([
    prisma.checklist.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        schedules: {
          where: { deletedAt: null },
          select: { dayOfWeek: true, fromTime: true, toTime: true },
          orderBy: [{ dayOfWeek: 'asc' }, { fromTime: 'asc' }],
        },
        events: {
          where: { deletedAt: null },
          select: {
            calendarEvent: {
              select: {
                id: true, venueId: true, title: true, startsAt: true, endsAt: true, allDay: true,
                deletedAt: true,
              },
            },
          },
          orderBy: { calendarEvent: { startsAt: 'asc' } },
        },
        tasks: {
          include: { task: { select: { id: true, title: true, isActive: true, version: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.venue.findUnique({ where: { id: session.venueId }, select: { timezone: true } }),
  ])

  // The editor must compare against the venue-local day, not the phone's UTC
  // day. The server supplies the verdict so the client never re-derives it.
  const today = getTodayDate(venue?.timezone)
  const nowHHmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: venue?.timezone ?? 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const dayOfWeek = weekdayOf(today)

  const result = checklists.map((c) => {
    const events = c.events.map((e) => e.calendarEvent)
    const openNow = isChecklistOpen(c.appearFromTime, c.activatedOn, today, nowHHmm, c.schedules, dayOfWeek, events)
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      venueId: c.venueId,
      departmentId: c.departmentId,
      sectionId: c.sectionId,
      appearFromTime: c.appearFromTime,
      activatedOn: c.activatedOn,
      activatedToday: isActivatedOn(c.activatedOn, today),
      schedules: c.schedules,
      events: events.map(summariseCalendarEvent),
      openNow,
      opensNext: openNow
        ? null
        : describeNextOpen({ schedules: c.schedules, appearFromTime: c.appearFromTime, events, day: today, nowHHmm, dayOfWeek }),
      allowedOutcomes: c.allowedOutcomes,
      requireOutcomeReason: c.requireOutcomeReason,
      department: c.department,
      section: c.section,
      tasks: c.tasks.map((ct) => ({
        id: ct.task.id,
        title: ct.task.title,
        isActive: ct.task.isActive,
        version: ct.task.version,
      })),
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canCreateList) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, departmentId, sectionId, appearFromTime, taskIds, allowedOutcomes, requireOutcomeReason, schedules, eventIds } = body

  if (!name?.trim()) return NextResponse.json({ error: 'NAME IS REQUIRED' }, { status: 400 })
  if (!taskIds?.length) return NextResponse.json({ error: 'ADD AT LEAST ONE TASK' }, { status: 400 })

  const scheduleCheck = validateSchedules(schedules)
  if (!scheduleCheck.ok) return NextResponse.json({ error: scheduleCheck.error }, { status: 400 })

  const parsedEvents = parseEventIds(eventIds)
  if (!parsedEvents.ok) return NextResponse.json({ error: parsedEvents.error }, { status: 400 })
  const eventError = await validateChecklistEventIds(session.venueId, parsedEvents.ids)
  if (eventError) return NextResponse.json({ error: eventError }, { status: 400 })

  const refError = await validateWorkerTaskRefs({
    venueId: session.venueId,
    departmentId,
    sectionId,
  })
  if (refError) return NextResponse.json({ error: refError }, { status: 400 })

  const ids: string[] = [...new Set<string>(Array.isArray(taskIds) ? taskIds : [])]
  if (ids.length !== taskIds.length) {
    return NextResponse.json({ error: 'DUPLICATE TASKS IN THIS LIST' }, { status: 400 })
  }
  const venueTaskCount = await prisma.task.count({
    where: { id: { in: ids }, venueId: session.venueId, deletedAt: null },
  })
  if (venueTaskCount !== ids.length) {
    return NextResponse.json({ error: 'ONE OR MORE TASKS ARE NOT IN THIS VENUE' }, { status: 400 })
  }

  const checklist = await prisma.checklist.create({
    data: {
      name: name.toUpperCase().trim(),
      description: description?.trim() || null,
      venueId: session.venueId,
      departmentId: departmentId || null,
      sectionId: sectionId || null,
      appearFromTime: appearFromTime || null,
      allowedOutcomes: normaliseOutcomes(allowedOutcomes),
      requireOutcomeReason: !!requireOutcomeReason,
      schedules: scheduleCheck.schedules.length ? { create: scheduleCheck.schedules } : undefined,
      tasks: { create: ids.map((taskId, i) => ({ taskId, sortOrder: i })) },
    },
  })

  if (parsedEvents.ids.length > 0) {
    await syncChecklistEvents(checklist.id, parsedEvents.ids)
  }

  return NextResponse.json(checklist, { status: 201 })
}
