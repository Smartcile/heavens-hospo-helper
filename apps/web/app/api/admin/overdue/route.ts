import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getTodayDate, clamp } from '@/lib/utils'
import { isTaskDueOnDate, formatDateKey } from '@/lib/scheduling'

// Missed tasks: for each active task and each day in the window (yesterday back
// N days, in the task's venue timezone), if the task was due that day but has no
// completion for that date, it counts as missed. Today is excluded — the day
// isn't over yet.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = clamp(Number(searchParams.get('days') ?? 7), 1, 30)

  const taskWhere = {
    deletedAt: null,
    isActive: true,
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    include: {
      department: { select: { name: true, colour: true } },
      venue: { select: { name: true, timezone: true } },
    },
  })

  if (tasks.length === 0) {
    return NextResponse.json({ days, totalMissed: 0, items: [] })
  }

  // "Today" per venue (its local calendar day).
  const venueToday = new Map<string, Date>()
  for (const t of tasks) {
    if (!venueToday.has(t.venueId)) venueToday.set(t.venueId, getTodayDate(t.venue.timezone))
  }

  // Earliest date we might inspect, for the completions query lower bound.
  const earliest = new Date(Math.min(...[...venueToday.values()].map((d) => d.getTime())))
  earliest.setUTCDate(earliest.getUTCDate() - (days + 1))

  const completions = await prisma.taskCompletion.findMany({
    where: {
      taskId: { in: tasks.map((t) => t.id) },
      scheduledDate: { gte: earliest },
    },
    select: { taskId: true, scheduledDate: true },
  })
  const doneSet = new Set(completions.map((c) => `${c.taskId}|${formatDateKey(c.scheduledDate)}`))

  const items: {
    taskId: string
    taskTitle: string
    departmentName: string | null
    departmentColour: string | null
    venueName: string
    date: string
  }[] = []

  for (const t of tasks) {
    const today = venueToday.get(t.venueId)!
    const createdKey = formatDateKey(new Date(t.createdAt))

    for (let i = 1; i <= days; i++) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const key = formatDateKey(d)

      if (key < createdKey) continue
      if (!isTaskDueOnDate(t, d)) continue
      if (doneSet.has(`${t.id}|${key}`)) continue

      items.push({
        taskId: t.id,
        taskTitle: t.title,
        departmentName: t.department?.name ?? null,
        departmentColour: t.department?.colour ?? null,
        venueName: t.venue.name,
        date: d.toISOString(),
      })
    }
  }

  items.sort((a, b) => (a.date < b.date ? 1 : -1))

  return NextResponse.json({
    days,
    totalMissed: items.length,
    items: items.slice(0, 100),
  })
}
