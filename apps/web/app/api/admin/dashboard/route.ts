import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getTodayDate, completionPercent } from '@/lib/utils'
import { isTaskDueOnDate, formatDateKey } from '@/lib/scheduling'
import type { DashboardStats } from '@hospo-ops/types'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueWhere = {
    deletedAt: null,
    isActive: true,
    ...(session.user.role === 'MANAGER' ? { id: session.user.venueId } : {}),
  }

  const venues = await prisma.venue.findMany({
    where: venueWhere,
    include: {
      departments: {
        where: { deletedAt: null, isActive: true },
        include: {
          tasks: { where: { deletedAt: null, isActive: true } },
        },
      },
    },
  })

  // Each venue's "today" is its own local calendar day.
  const venueToday = new Map<string, Date>()
  for (const venue of venues) {
    venueToday.set(venue.id, getTodayDate(venue.timezone))
  }

  // Fetch completions for the distinct "today" dates across venues in one query.
  const allTaskIds = venues.flatMap((v) => v.departments.flatMap((d) => d.tasks.map((t) => t.id)))
  const distinctDates = Array.from(
    new Map([...venueToday.values()].map((d) => [d.getTime(), d])).values()
  )

  const completions =
    allTaskIds.length > 0
      ? await prisma.taskCompletion.findMany({
          where: { taskId: { in: allTaskIds }, scheduledDate: { in: distinctDates } },
          select: { taskId: true, scheduledDate: true },
        })
      : []
  const doneSet = new Set(completions.map((c) => `${c.taskId}|${formatDateKey(c.scheduledDate)}`))

  let totalTasksToday = 0
  let completedTasksToday = 0

  const venueStats = venues.map((venue) => {
    const today = venueToday.get(venue.id)!
    const todayKey = formatDateKey(today)
    let vTotal = 0
    let vCompleted = 0

    const departmentStats = venue.departments.map((dept) => {
      const todayTasks = dept.tasks.filter((t) => isTaskDueOnDate(t, today))
      const dCompleted = todayTasks.filter((t) => doneSet.has(`${t.id}|${todayKey}`)).length
      vTotal += todayTasks.length
      vCompleted += dCompleted

      return {
        departmentId: dept.id,
        departmentName: dept.name,
        colour: dept.colour,
        totalTasks: todayTasks.length,
        completedTasks: dCompleted,
        completionPercent: completionPercent(dCompleted, todayTasks.length),
      }
    })

    totalTasksToday += vTotal
    completedTasksToday += vCompleted

    return {
      venueId: venue.id,
      venueName: venue.name,
      totalTasks: vTotal,
      completedTasks: vCompleted,
      completionPercent: completionPercent(vCompleted, vTotal),
      departmentStats,
    }
  })

  const recentCompletions = await prisma.taskCompletion.findMany({
    where: {
      task: {
        venueId: session.user.role === 'MANAGER' ? session.user.venueId : undefined,
      },
    },
    include: {
      task: {
        include: {
          department: { select: { name: true } },
        },
      },
      staff: { select: { firstName: true, lastName: true } },
    },
    orderBy: { completedAt: 'desc' },
    take: 20,
  })

  // Par level alerts
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : undefined
  const itemsWithPar = await prisma.inventoryItem.findMany({
    where: {
      ...(venueId ? { venueId } : {}),
      deletedAt: null,
      defaultParLevel: { gt: 0 },
    },
    include: {
      category: { select: { name: true } },
      elements: {
        where: { element: { deletedAt: null } },
        select: { quantity: true },
      },
    },
  })
  const parAlerts = itemsWithPar
    .map((item) => {
      const currentQty = item.elements.reduce((sum, e) => sum + e.quantity, 0)
      return currentQty < item.defaultParLevel
        ? { itemName: item.name, categoryName: item.category.name, currentQty, parLevel: item.defaultParLevel }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const stats: DashboardStats = {
    totalTasksToday,
    completedTasksToday,
    completionPercent: completionPercent(completedTasksToday, totalTasksToday),
    overdueCount: totalTasksToday - completedTasksToday,
    venueStats,
    recentActivity: recentCompletions.map((c) => ({
      id: c.id,
      staffName: `${c.staff.firstName} ${c.staff.lastName}`,
      taskTitle: c.task.title,
      departmentName: c.task.department?.name ?? null,
      completedAt: c.completedAt,
    })),
    parAlerts,
  }

  return NextResponse.json(stats)
}
