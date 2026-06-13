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

  const where = {
    venueId: session.venueId,
    isActive: true,
    deletedAt: null,
    ...(session.departmentId ? { departmentId: session.departmentId } : {}),
    OR: [
      { assignedToStaffId: null },
      { assignedToStaffId: session.staffId },
    ],
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, colour: true } },
      taskCompletions: {
        where: { scheduledDate: today },
        orderBy: { completedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
  })

  const todayTasks = tasks.filter((t) => isTaskDueOnDate(t, today))

  const result = todayTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    completionType: t.completionType,
    departmentName: t.department?.name ?? null,
    isCompleted: t.taskCompletions.length > 0,
    completion: t.taskCompletions[0]
      ? {
          id: t.taskCompletions[0].id,
          note: t.taskCompletions[0].note,
          photoUrl: t.taskCompletions[0].photoUrl,
          completedAt: t.taskCompletions[0].completedAt,
        }
      : null,
  }))

  return NextResponse.json({ tasks: result, firstName: session.firstName })
}
