import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'
import { isTaskDueOnDate } from '@/lib/scheduling'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve linked department IDs — staff see tasks from their home department
  // AND any departments linked to it.
  let linkedDepartmentIds: string[] = []
  if (session.departmentId) {
    const links = await prisma.departmentLink.findMany({
      where: { fromDepartmentId: session.departmentId },
      select: { toDepartmentId: true },
    })
    linkedDepartmentIds = links.map((l) => l.toDepartmentId)
  }
  const departmentIds = session.departmentId
    ? [session.departmentId, ...linkedDepartmentIds]
    : null

  if (req.nextUrl.searchParams.get('edit') === '1') {
    const tasks = await prisma.task.findMany({
      where: {
        venueId: session.venueId,
        isActive: true,
        deletedAt: null,
        ...(departmentIds ? { departmentId: { in: departmentIds } } : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        requiredTraining: { select: { moduleId: true, module: { select: { kind: true } } } },
      },
      orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
    })
    return NextResponse.json(tasks)
  }

  // "Today" is the venue's local calendar day, so daily tasks reset at the
  // venue's local midnight rather than UTC midnight.
  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const today = getTodayDate(venue?.timezone)

  // Show the WHOLE department's lists for the day — everyone on the floor sees
  // every list; completion is shared (global per task+date), so no double-ups.
  const where = {
    venueId: session.venueId,
    isActive: true,
    deletedAt: null,
    ...(departmentIds ? { departmentId: { in: departmentIds } } : {}),
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, colour: true } },
      section: { select: { id: true, name: true } },
      taskCompletions: {
        where: { scheduledDate: today },
        include: { staff: { select: { firstName: true, lastName: true } } },
        orderBy: { completedAt: 'desc' },
        take: 1,
      },
      trainingModules: {
        where: { isActive: true, deletedAt: null },
        select: { id: true, title: true },
        take: 1,
      },
    },
    orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
  })

  const todayTasks = tasks.filter((t) => isTaskDueOnDate(t, today))

  // ── Rollover handling ──
  // A rolled-over one-off completed on its dueDate should not reappear today.
  const rolledTasks = todayTasks.filter((t) => t.isOneOff && t.rolloverEnabled && t.dueDate)
  if (rolledTasks.length > 0) {
    const rolledCompletions = await prisma.taskCompletion.findMany({
      where: {
        taskId: { in: rolledTasks.map((t) => t.id) },
        scheduledDate: { in: [...new Set(rolledTasks.map((t) => new Date(t.dueDate!)))] },
      },
      select: { taskId: true, id: true, note: true, photoUrl: true, completedAt: true, staff: { select: { firstName: true, lastName: true } } },
      orderBy: { completedAt: 'desc' },
    })
    const completedMap = new Map(rolledCompletions.map((c) => [c.taskId, c]))
    // Attach the completion from the due date to the task so the UI marks it done
    for (const t of rolledTasks) {
      const c = completedMap.get(t.id)
      if (c && !t.taskCompletions.some((tc) => tc.id === c.id)) {
        ;(t as any).taskCompletions = [c]
      }
    }
  }

  // Resolve names for any personally-assigned tasks (shown as a tag, still shared).
  const assigneeIds = [...new Set(todayTasks.map((t) => t.assignedToStaffId).filter(Boolean))] as string[]
  const assignees = assigneeIds.length
    ? await prisma.staff.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, firstName: true, lastName: true } })
    : []
  const assigneeName = new Map(assignees.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))

  // Checklists ("lists") for this floor — they gate visibility by appear-from
  // time and stay until everything's done.
  const checklists = await prisma.checklist.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      venueId: session.venueId,
      ...(departmentIds ? { OR: [{ departmentId: { in: departmentIds } }, { departmentId: null }] } : {}),
    },
    select: {
      id: true,
      name: true,
      appearFromTime: true,
      tasks: { select: { taskId: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ appearFromTime: 'asc' }, { name: 'asc' }],
  })
  const checklistResult = checklists.map((c) => ({
    id: c.id,
    name: c.name,
    appearFromTime: c.appearFromTime,
    taskIds: c.tasks.map((ct) => ct.taskId),
  }))

  const result = todayTasks.map((t) => {
    const c = t.taskCompletions[0]
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      completionType: t.completionType,
      departmentName: t.department?.name ?? null,
      sectionName: t.section?.name ?? null,
      assigneeName: t.assignedToStaffId ? assigneeName.get(t.assignedToStaffId) ?? null : null,
      guide: t.trainingModules[0] ?? null,
      isCompleted: t.taskCompletions.length > 0,
      completedByName: c ? `${c.staff.firstName} ${c.staff.lastName}` : null,
      completion: c
        ? { id: c.id, note: c.note, photoUrl: c.photoUrl, completedAt: c.completedAt }
        : null,
      isOneOff: t.isOneOff,
      dueDate: t.dueDate,
      rolloverEnabled: t.rolloverEnabled,
      rolledOverFrom: t.rolledOverFrom,
    }
  })

  return NextResponse.json({ tasks: result, checklists: checklistResult, firstName: session.firstName })
}

export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, description, departmentId, sectionId, completionType,
    scheduleType, scheduleDays, customCron, intervalMonths,
    monthlyOption, monthlyDay, requiredTrainingIds,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'TITLE IS REQUIRED' }, { status: 400 })
  if (scheduleType === 'WEEKLY' && (!scheduleDays || scheduleDays.length === 0))
    return NextResponse.json({ error: 'SELECT AT LEAST ONE DAY FOR WEEKLY SCHEDULE' }, { status: 400 })
  if (scheduleType === 'CUSTOM' && !customCron?.trim())
    return NextResponse.json({ error: 'CRON EXPRESSION IS REQUIRED FOR CUSTOM SCHEDULE' }, { status: 400 })

  let resolvedDeptId = departmentId || null
  const resolvedSectionId = sectionId || null
  if (sectionId && !departmentId) {
    const s = await prisma.section.findUnique({ where: { id: sectionId }, select: { departmentId: true } })
    if (s) resolvedDeptId = s.departmentId
  }

  const task = await prisma.task.create({
    data: {
      title: title.toUpperCase().trim(),
      description: description?.trim() || null,
      venueId: session.venueId,
      departmentId: resolvedDeptId,
      sectionId: resolvedSectionId,
      completionType: completionType || 'TICK',
      scheduleType: scheduleType || 'DAILY',
      scheduleDays: scheduleType === 'DAILY' ? [] : scheduleDays || [],
      customCron: scheduleType === 'CUSTOM' ? customCron : null,
      intervalMonths: Math.max(1, intervalMonths || 1),
      monthlyOption: scheduleType === 'MONTHLY' ? (monthlyOption || 'FIRST_DAY') : null,
      monthlyDay: scheduleType === 'MONTHLY' && monthlyOption === 'SPECIFIC_DAY' ? (monthlyDay || 1) : null,
    },
  })

  if (requiredTrainingIds?.length) {
    await prisma.taskRequiredTraining.createMany({
      data: requiredTrainingIds.map((moduleId: string) => ({ taskId: task.id, moduleId })),
    })
    await prisma.trainingModule.updateMany({
      where: { id: { in: requiredTrainingIds } },
      data: { linkedTaskId: task.id },
    })
  }

  return NextResponse.json(task, { status: 201 })
}
