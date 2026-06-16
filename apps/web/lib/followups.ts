// Trigger engine (Phase D). Turns gaps into manager follow-ups:
//   • UNTRAINED — a task completed by someone who lacks its required training
//   • MISSED    — an assigned task that was due but not completed (also
//                 auto-assigns the required training to the person)
// Idempotent: FollowUp has @@unique([venueId, staffId, kind, taskId, dueDate]).

import { prisma } from '@hospo-ops/db'
import { getTodayDate } from '@/lib/utils'
import { isTaskDueOnDate, formatDateKey } from '@/lib/scheduling'

const MISSED_WINDOW_DAYS = 7

/**
 * Called right after a task completion is saved. If the task declares required
 * training the staff member doesn't hold, raise an UNTRAINED follow-up.
 * Best-effort — callers should not let this block the completion.
 */
export async function checkUntrainedOnCompletion(opts: {
  taskId: string
  staffId: string
  venueId: string
  date: Date
}): Promise<void> {
  const required = await prisma.taskRequiredTraining.findMany({
    where: { taskId: opts.taskId },
    include: { module: { select: { id: true, title: true } } },
  })
  if (required.length === 0) return

  const moduleIds = required.map((r) => r.moduleId)
  const held = await prisma.trainingCompletion.findMany({
    where: { staffId: opts.staffId, moduleId: { in: moduleIds } },
    select: { moduleId: true },
  })
  const heldSet = new Set(held.map((h) => h.moduleId))
  const missing = required.filter((r) => !heldSet.has(r.moduleId))
  if (missing.length === 0) return

  const task = await prisma.task.findUnique({ where: { id: opts.taskId }, select: { title: true } })
  const detail = `Completed "${task?.title ?? 'task'}" without: ${missing.map((m) => m.module.title).join(', ')}`

  await prisma.followUp.upsert({
    where: {
      venueId_staffId_kind_taskId_dueDate: {
        venueId: opts.venueId,
        staffId: opts.staffId,
        kind: 'UNTRAINED',
        taskId: opts.taskId,
        dueDate: opts.date,
      },
    },
    create: {
      venueId: opts.venueId,
      staffId: opts.staffId,
      taskId: opts.taskId,
      moduleId: missing[0].moduleId,
      kind: 'UNTRAINED',
      detail,
      dueDate: opts.date,
    },
    update: { detail, moduleId: missing[0].moduleId },
  })
}

/**
 * Scan an assigned task's recent due dates; for each miss, raise a MISSED
 * follow-up and auto-assign the required training to the responsible person.
 * Idempotent — safe to run on every Follow-ups page load.
 */
export async function generateVenueFollowUps(venueId: string): Promise<number> {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { id: true, timezone: true },
  })
  if (!venue) return 0

  const today = getTodayDate(venue.timezone)
  // Window of past days (exclude today — it isn't over yet).
  const dates: Date[] = []
  for (let i = 1; i <= MISSED_WINDOW_DAYS; i++) {
    dates.push(new Date(today.getTime() - i * 86400000))
  }

  // Assigned, active tasks that declare required training.
  const tasks = await prisma.task.findMany({
    where: {
      venueId,
      deletedAt: null,
      isActive: true,
      assignedToStaffId: { not: null },
      requiredTraining: { some: {} },
    },
    select: {
      id: true,
      title: true,
      assignedToStaffId: true,
      scheduleType: true,
      scheduleDays: true,
      customCron: true,
      createdAt: true,
      requiredTraining: { select: { moduleId: true } },
    },
  })
  if (tasks.length === 0) return 0

  const taskIds = tasks.map((t) => t.id)
  const completions = await prisma.taskCompletion.findMany({
    where: { taskId: { in: taskIds }, scheduledDate: { in: dates } },
    select: { taskId: true, staffId: true, scheduledDate: true },
  })
  const done = new Set(completions.map((c) => `${c.taskId}|${c.staffId}|${formatDateKey(c.scheduledDate)}`))

  let created = 0
  for (const task of tasks) {
    const staffId = task.assignedToStaffId!
    const createdDay = formatDateKey(task.createdAt)
    for (const date of dates) {
      const key = formatDateKey(date)
      if (key < createdDay) continue // don't flag dates before the task existed
      if (!isTaskDueOnDate(task, date)) continue
      if (done.has(`${task.id}|${staffId}|${key}`)) continue

      // Auto-assign the required training (idempotent on @@unique moduleId+staffId).
      for (const r of task.requiredTraining) {
        await prisma.trainingAssignment.upsert({
          where: { moduleId_staffId: { moduleId: r.moduleId, staffId } },
          create: { moduleId: r.moduleId, staffId, reason: 'FOLLOW-UP: MISSED TASK' },
          update: {},
        })
      }

      const fu = await prisma.followUp.upsert({
        where: {
          venueId_staffId_kind_taskId_dueDate: {
            venueId, staffId, kind: 'MISSED', taskId: task.id, dueDate: date,
          },
        },
        create: {
          venueId,
          staffId,
          taskId: task.id,
          moduleId: task.requiredTraining[0]?.moduleId ?? null,
          kind: 'MISSED',
          detail: `Missed "${task.title}" on ${key} — training assigned`,
          dueDate: date,
        },
        update: {},
      })
      if (fu.createdAt.getTime() === fu.updatedAt.getTime()) created++
    }
  }
  return created
}
