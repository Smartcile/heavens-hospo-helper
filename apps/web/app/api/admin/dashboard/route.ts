import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getTodayDate, completionPercent } from '@/lib/utils'
import { isTaskDueOnDate } from '@/lib/scheduling'
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
          tasks: {
            where: { deletedAt: null, isActive: true },
            include: {
              taskCompletions: {
                where: {
                  scheduledDate: getTodayDate(),
                },
              },
            },
          },
        },
      },
    },
  })

  const today = getTodayDate()

  let totalTasksToday = 0
  let completedTasksToday = 0

  const venueStats = venues.map((venue) => {
    let vTotal = 0
    let vCompleted = 0

    const departmentStats = venue.departments.map((dept) => {
      const todayTasks = dept.tasks.filter((t) => isTaskDueOnDate(t, today))
      const dCompleted = todayTasks.filter((t) => t.taskCompletions.length > 0).length
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
  }

  return NextResponse.json(stats)
}
