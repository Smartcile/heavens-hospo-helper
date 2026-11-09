import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { cleanNoticeAudiences } from '@/lib/notice-audience'
import { normaliseOutcomes } from '@/lib/task-outcomes'
import { parseTaskGroups } from '@/lib/task-groups'
import { summariseCalendarEvent, validateSchedules } from '@/lib/checklist-activation'
import {
  parseEventIds,
  syncChecklistEvents,
  validateChecklistEventIds,
} from '@/lib/checklist-events.server'

interface Params {
  params: { id: string }
}

// Single checklist for the reference popup (name + ordered live tasks).
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

  const c = await prisma.checklist.findFirst({
    where: { id: params.id, deletedAt: null },
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
        orderBy: { sortOrder: 'asc' },
        include: {
          task: {
            select: {
              id: true, title: true, completionType: true, scheduleType: true,
              isActive: true, deletedAt: true,
            },
          },
        },
      },
    },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && c.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    id: c.id,
    name: c.name,
    description: c.description,
    venueId: c.venueId,
    department: c.department,
    section: c.section,
    appearFromTime: c.appearFromTime,
    schedules: c.schedules,
    events: c.events.map((e) => summariseCalendarEvent(e.calendarEvent)),
    allowedOutcomes: c.allowedOutcomes,
    requireOutcomeReason: c.requireOutcomeReason,
    multiDay: c.multiDay,
    tasks: c.tasks
      .filter((ct) => ct.task && !ct.task.deletedAt)
      .map((ct) => ({ ...ct.task, groupLabel: ct.groupLabel })),
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.edit')
  if (denied) return denied

  const existing = await prisma.checklist.findUnique({ where: { id: params.id }, select: { venueId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  let parsedEvents: ReturnType<typeof parseEventIds> | null = null
  if (body.eventIds !== undefined) {
    parsedEvents = parseEventIds(body.eventIds)
    if (!parsedEvents.ok) return NextResponse.json({ error: parsedEvents.error }, { status: 400 })
    const eventError = await validateChecklistEventIds(existing.venueId, parsedEvents.ids)
    if (eventError) return NextResponse.json({ error: eventError }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).toUpperCase().trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.sectionId !== undefined) updates.sectionId = body.sectionId || null
  if (body.appearFromTime !== undefined) updates.appearFromTime = body.appearFromTime?.trim() || null
  if (body.allowedOutcomes !== undefined) updates.allowedOutcomes = normaliseOutcomes(body.allowedOutcomes)
  if (body.requireOutcomeReason !== undefined) updates.requireOutcomeReason = !!body.requireOutcomeReason
  if (body.multiDay !== undefined) updates.multiDay = !!body.multiDay
  if (body.isActive !== undefined) updates.isActive = !!body.isActive
  if (body.schedules !== undefined) {
    const scheduleCheck = validateSchedules(body.schedules)
    if (!scheduleCheck.ok) return NextResponse.json({ error: scheduleCheck.error }, { status: 400 })
    updates.schedules = {
      updateMany: { where: { deletedAt: null }, data: { deletedAt: new Date() } },
      create: scheduleCheck.schedules,
    }
  }
  if (body.taskIds !== undefined) {
    const ids: string[] = Array.isArray(body.taskIds) ? body.taskIds : []
    const groups = parseTaskGroups(body.taskGroups)
    updates.tasks = {
      deleteMany: {},
      create: ids.map((taskId: string, i: number) => ({
        taskId,
        sortOrder: i,
        groupLabel: groups[taskId] ?? null,
      })),
    }
  }
  if (body.audiences !== undefined) {
    updates.audiences = { deleteMany: {}, create: cleanNoticeAudiences(body.audiences) }
  }

  const checklist = await prisma.checklist.update({ where: { id: params.id }, data: updates })

  if (parsedEvents && parsedEvents.ok) {
    await syncChecklistEvents(params.id, parsedEvents.ids)
  }

  return NextResponse.json(checklist)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'execution.tasks.delete')
  if (denied) return denied

  const existing = await prisma.checklist.findUnique({ where: { id: params.id }, select: { venueId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.checklist.update({ where: { id: params.id }, data: { deletedAt: new Date(), isActive: false } })
  return NextResponse.json({ success: true })
}
