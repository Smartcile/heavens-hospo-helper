import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'
import { isTaskDueOnDate } from '@/lib/scheduling'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    ...(session.departmentId ? { departmentId: session.departmentId } : {}),
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

  // Resolve names for any personally-assigned tasks (shown as a tag, still shared).
  const assigneeIds = [...new Set(todayTasks.map((t) => t.assignedToStaffId).filter(Boolean))] as string[]
  const assignees = assigneeIds.length
    ? await prisma.staff.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, firstName: true, lastName: true } })
    : []
  const assigneeName = new Map(assignees.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))

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
      // A linked how-to guide, if one exists for this task.
      guide: t.trainingModules[0] ?? null,
      isCompleted: t.taskCompletions.length > 0,
      completedByName: c ? `${c.staff.firstName} ${c.staff.lastName}` : null,
      completion: c
        ? { id: c.id, note: c.note, photoUrl: c.photoUrl, completedAt: c.completedAt }
        : null,
    }
  })

  return NextResponse.json({ tasks: result, firstName: session.firstName })
}
