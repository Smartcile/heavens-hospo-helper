import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getTodayDate } from '@/lib/utils'
import { formatDateKey } from '@/lib/scheduling'
import { healthWidgetMetrics } from '@/lib/food-safety'
import { guardAccess } from '@/lib/permissions'

// One round trip for the Compliance hub's TASKS tab: the health widget, the
// ACTIVE/DRAFT/ARCHIVED counts, every H&S task with its last-7-day completions
// and open-alert rollup, and the latest open alerts for the ALERTS tab.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'compliance.tasks.view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId') ?? (session.user.role === 'MANAGER' ? session.user.venueId : undefined)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { timezone: true } })
  const today = getTodayDate(venue?.timezone)
  const windowStart = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)

  // H&S tasks: anything categorised into the compliance groups or a READING check.
  const tasks = await prisma.task.findMany({
    where: {
      venueId,
      deletedAt: null,
      OR: [{ hsCategory: { not: null } }, { completionType: 'READING' }],
    },
    include: {
      department: { select: { id: true, name: true, colour: true } },
      section: { select: { id: true, name: true } },
      linkedItem: { select: { id: true, name: true, storageType: true } },
    },
    orderBy: [{ hsCategory: 'asc' }, { sortOrder: 'asc' }],
  })

  const taskIds = tasks.map((t) => t.id)
  const [recentCompletions, openAlerts, catalog] = await Promise.all([
    taskIds.length
      ? prisma.taskCompletion.findMany({
          where: { taskId: { in: taskIds }, scheduledDate: { gte: windowStart } },
          select: { id: true, taskId: true, value: true, valueStatus: true, completedAt: true },
        })
      : Promise.resolve([]),
    prisma.hsAlert.findMany({
      where: { venueId, status: 'OPEN', deletedAt: null },
      include: { task: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.inventoryItem.findMany({
      where: { venueId, deletedAt: null, isActive: true },
      select: { id: true, name: true, storageType: true, unit: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const byTask = new Map<string, typeof recentCompletions>()
  for (const c of recentCompletions) {
    const list = byTask.get(c.taskId) ?? []
    list.push(c)
    byTask.set(c.taskId, list)
  }
  const completionsByTask = Object.fromEntries(byTask)

  const openCountByTask = new Map<string, number>()
  for (const a of openAlerts) {
    if (!a.taskId) continue
    openCountByTask.set(a.taskId, (openCountByTask.get(a.taskId) ?? 0) + 1)
  }

  const counts = { active: 0, draft: 0, archived: 0 }
  for (const t of tasks) {
    if (t.status === 'DRAFT') counts.draft++
    else if (t.status === 'ARCHIVED') counts.archived++
    else counts.active++
  }

  return NextResponse.json({
    health: healthWidgetMetrics(tasks, completionsByTask, openAlerts),
    counts,
    tasks: tasks.map((t) => ({
      ...t,
      completions: (byTask.get(t.id) ?? []).sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime()),
      openAlertCount: openCountByTask.get(t.id) ?? 0,
    })),
    recentAlerts: openAlerts,
    catalog,
    todayKey: formatDateKey(today),
  })
}
