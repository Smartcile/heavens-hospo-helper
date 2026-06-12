import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { isTaskScheduledToday, getTodayDate } from '@/lib/utils'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = getTodayDate()

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })

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

  const timezone = venue?.timezone
  const todayTasks = tasks.filter((t) =>
    isTaskScheduledToday(t.scheduleType, t.scheduleDays, timezone)
  )

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
