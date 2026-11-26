// FINISH TOMORROW server half (#143). Resolves the first open list (same rule
// as the outcome policy), records the push and raises the manager Notice once a
// streak reaches the list's threshold.
//
// Deliberately writes NO completion / follow-up / section-review / report row:
// a push is a deferral, not work done. The only rows touched are TaskProgress
// (the in-progress marker with `pushedToDate`), TaskPush (audit) and — at the
// threshold — a Notice.

import { prisma } from '@hospo-ops/db'
import { getTodayDate } from '@/lib/utils'
import { formatDateKey } from '@/lib/scheduling'
import { applicableChecklistsForStaff } from '@/lib/checklist-applicability.server'
import {
  isPushAllowed,
  normalisePushAlertAfter,
  openPushList,
  pushStreakCount,
  shouldAlert,
  streakAlerted,
  tomorrowKey,
  type PushListLike,
} from '@/lib/task-push'

export type PushTaskResult =
  | { ok: true; pushedTo: string; streak: number; alertRaised: boolean }
  | { ok: false; status: number; error: string }

export type UndoPushResult = { ok: true } | { ok: false; status: number; error: string }

/** Venue-local "today" + "HH:mm", the convention every task route uses. */
async function venueClock(venueId: string): Promise<{ today: Date; nowHHmm: string }> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  })
  const today = getTodayDate(venue?.timezone)
  const nowHHmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: venue?.timezone ?? 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  return { today, nowHHmm }
}

export async function pushTaskToTomorrow(opts: {
  taskId: string
  staffId: string
  venueId: string
  departmentId?: string | null
  staffName?: string | null
  note?: string | null
}): Promise<PushTaskResult> {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    select: { id: true, title: true, venueId: true, departmentId: true },
  })
  if (!task || task.venueId !== opts.venueId) {
    return { ok: false, status: 404, error: 'Not found' }
  }

  const { today, nowHHmm } = await venueClock(opts.venueId)
  const { checklists } = await applicableChecklistsForStaff({
    staffId: opts.staffId,
    venueId: opts.venueId,
    departmentId: opts.departmentId ?? null,
    taskId: opts.taskId,
  })
  const lists: PushListLike[] = checklists.map((c) => ({
    name: c.name,
    appearFromTime: c.appearFromTime,
    activatedOn: c.activatedOn,
    schedules: c.schedules,
    events: c.events,
    allowPushToTomorrow: c.allowPushToTomorrow,
    pushAlertAfter: c.pushAlertAfter,
  }))
  const openList = openPushList(lists, { today, nowHHmm })
  if (!openList) {
    return { ok: false, status: 422, error: 'OPEN A LIST BEFORE FINISHING THIS TASK TOMORROW' }
  }
  if (!isPushAllowed(openList)) {
    return { ok: false, status: 422, error: 'FINISH TOMORROW IS NOT ENABLED FOR THIS LIST' }
  }

  const todayKey = formatDateKey(today)
  const pushedTo = tomorrowKey(todayKey)
  const toDate = new Date(`${pushedTo}T00:00:00.000Z`)
  const note = opts.note?.trim() || null

  const hideTask = () =>
    prisma.taskProgress.upsert({
      where: { taskId: opts.taskId },
      create: {
        taskId: opts.taskId,
        staffId: opts.staffId,
        note,
        outcome: 'PARTIAL',
        progressDate: today,
        pushedToDate: toDate,
      },
      update: {
        staffId: opts.staffId,
        progressDate: today,
        pushedToDate: toDate,
        ...(note !== null ? { note } : {}),
      },
    })

  // Re-pushing the same task on the same day is a no-op: it is already hidden.
  const existingToday = await prisma.taskPush.findFirst({
    where: { taskId: opts.taskId, fromDate: today, deletedAt: null },
    select: { id: true, toDate: true },
  })
  if (existingToday) {
    await hideTask()
    const pushes = await prisma.taskPush.findMany({
      where: { taskId: opts.taskId, deletedAt: null },
      select: { fromDate: true, toDate: true, alertedAt: true },
    })
    return {
      ok: true,
      pushedTo: formatDateKey(existingToday.toDate),
      streak: pushStreakCount(pushes),
      alertRaised: false,
    }
  }

  await hideTask()
  const push = await prisma.taskPush.create({
    data: {
      taskId: opts.taskId,
      staffId: opts.staffId,
      venueId: opts.venueId,
      fromDate: today,
      toDate,
      note,
    },
  })

  const pushes = await prisma.taskPush.findMany({
    where: { taskId: opts.taskId, deletedAt: null },
    select: { fromDate: true, toDate: true, alertedAt: true },
  })
  const streak = pushStreakCount(pushes)
  const threshold = normalisePushAlertAfter(openList.pushAlertAfter)
  const alertRaised = shouldAlert(streak, threshold, { alreadyAlerted: streakAlerted(pushes) })

  if (alertRaised) {
    // One pinned, non-ack manager Notice for the streak. Best-effort: the push
    // stands even if the notice cannot be written.
    try {
      await prisma.notice.create({
        data: {
          venueId: opts.venueId,
          departmentId: task.departmentId,
          title: `${task.title} — PUSHED ${streak}×`.toUpperCase().slice(0, 120),
          body: [
            `"${task.title}" has been finished tomorrow ${streak} times in a row on "${openList.name}".`,
            opts.staffName ? `${opts.staffName} pushed it again.` : 'It was pushed again.',
            note ? `WHY: ${note}` : null,
          ]
            .filter(Boolean)
            .join('\n\n'),
          priority: 'IMPORTANT',
          pinned: true,
          requiresAck: false,
          startsAt: new Date(),
          createdById: opts.staffId,
        },
      })
      await prisma.taskPush.update({
        where: { id: push.id },
        data: { alertedAt: new Date() },
      })
    } catch {
      /* best-effort */
    }
  }

  return { ok: true, pushedTo, streak, alertRaised }
}

/**
 * Undo today's push: soft-delete the audit row and clear `pushedToDate` so the
 * task returns to today's floor. An earlier PARTIAL stays in progress.
 */
export async function undoTaskPush(opts: {
  taskId: string
  venueId: string
}): Promise<UndoPushResult> {
  const task = await prisma.task.findUnique({
    where: { id: opts.taskId },
    select: { venueId: true },
  })
  if (!task || task.venueId !== opts.venueId) {
    return { ok: false, status: 404, error: 'Not found' }
  }

  const { today } = await venueClock(opts.venueId)
  const push = await prisma.taskPush.findFirst({
    where: {
      taskId: opts.taskId,
      venueId: opts.venueId,
      fromDate: today,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!push) return { ok: false, status: 404, error: 'NO PUSH TO UNDO TODAY' }

  await prisma.taskPush.update({
    where: { id: push.id },
    data: { deletedAt: new Date() },
  })
  await prisma.taskProgress.updateMany({
    where: { taskId: opts.taskId, pushedToDate: { not: null } },
    data: { pushedToDate: null },
  })
  return { ok: true }
}
