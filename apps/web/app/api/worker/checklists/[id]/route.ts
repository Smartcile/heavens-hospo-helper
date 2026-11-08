import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { normaliseOutcomes } from '@/lib/task-outcomes'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { validateWorkerTaskRefs } from '@/lib/worker-task-refs.server'
import { cleanNoticeAudiences } from '@/lib/notice-audience'
import { validateSchedules } from '@/lib/checklist-activation'
import {
  parseEventIds,
  syncChecklistEvents,
  validateChecklistEventIds,
} from '@/lib/checklist-events.server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canEditList) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.checklist.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, departmentId, sectionId, appearFromTime, taskIds, allowedOutcomes, requireOutcomeReason, multiDay, schedules, eventIds, audiences } = body

  let scheduleData: ReturnType<typeof validateSchedules> | null = null
  if (schedules !== undefined) {
    scheduleData = validateSchedules(schedules)
    if (!scheduleData.ok) return NextResponse.json({ error: scheduleData.error }, { status: 400 })
  }

  let parsedEvents: ReturnType<typeof parseEventIds> | null = null
  if (eventIds !== undefined) {
    parsedEvents = parseEventIds(eventIds)
    if (!parsedEvents.ok) return NextResponse.json({ error: parsedEvents.error }, { status: 400 })
    const eventError = await validateChecklistEventIds(session.venueId, parsedEvents.ids)
    if (eventError) return NextResponse.json({ error: eventError }, { status: 400 })
  }

  const refError = await validateWorkerTaskRefs({
    venueId: session.venueId,
    departmentId: departmentId !== undefined ? departmentId || null : undefined,
    sectionId: sectionId !== undefined ? sectionId || null : undefined,
  })
  if (refError) return NextResponse.json({ error: refError }, { status: 400 })

  let ids: string[] | undefined
  if (taskIds !== undefined) {
    const rawIds: string[] = Array.isArray(taskIds) ? taskIds : []
    ids = [...new Set<string>(rawIds)]
    if (ids.length !== rawIds.length) {
      return NextResponse.json({ error: 'DUPLICATE TASKS IN THIS LIST' }, { status: 400 })
    }
    const venueTaskCount = await prisma.task.count({
      where: { id: { in: ids }, venueId: session.venueId, deletedAt: null },
    })
    if (venueTaskCount !== ids.length) {
      return NextResponse.json({ error: 'ONE OR MORE TASKS ARE NOT IN THIS VENUE' }, { status: 400 })
    }
  }

  const checklist = await prisma.checklist.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.toUpperCase().trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(departmentId !== undefined && { departmentId: departmentId || null }),
      ...(sectionId !== undefined && { sectionId: sectionId || null }),
      ...(appearFromTime !== undefined && { appearFromTime: appearFromTime || null }),
      ...(allowedOutcomes !== undefined && { allowedOutcomes: normaliseOutcomes(allowedOutcomes) }),
      ...(requireOutcomeReason !== undefined && { requireOutcomeReason: !!requireOutcomeReason }),
      ...(multiDay !== undefined && { multiDay: !!multiDay }),
      ...(audiences !== undefined && {
        audiences: { deleteMany: {}, create: cleanNoticeAudiences(audiences) },
      }),
      ...(scheduleData && {
        schedules: {
          updateMany: { where: { deletedAt: null }, data: { deletedAt: new Date() } },
          create: scheduleData.schedules,
        },
      }),
      ...(ids !== undefined && {
        tasks: {
          deleteMany: {},
          create: ids.map((taskId, i) => ({ taskId, sortOrder: i })),
        },
      }),
    },
  })

  if (parsedEvents && parsedEvents.ok) {
    await syncChecklistEvents(checklist.id, parsedEvents.ids)
  }

  return NextResponse.json(checklist)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canDeleteList) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.checklist.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.checklist.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
