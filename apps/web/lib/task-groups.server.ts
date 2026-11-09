// Server half of checklist task groups. Resolves one checklist's group, checks
// every task against the same outcome policy the worker saw, and settles the
// eligible ones as NOT_REQUIRED in one transaction.
//
// Grouping is checklist-scoped: the lookup is (checklistId, groupLabel), never
// just the task, so the same task can be ungrouped on another list.

import { prisma } from '@hospo-ops/db'
import { getTodayDate } from '@/lib/utils'
import { formatDateKey, isTaskDueOnDate } from '@/lib/scheduling'
import { carryTaskToday } from '@/lib/task-progress'
import { isChecklistOpen, weekdayOf } from '@/lib/checklist-activation'
import { applicableChecklistsForStaff, type ApplicableChecklist } from '@/lib/checklist-applicability.server'
import {
  resolveOutcomePolicyForChecklists,
  type OutcomePolicyChecklist,
  type TaskOutcome,
} from '@/lib/task-outcomes'
import {
  normaliseGroupLabel,
  planBulkNotRequired,
  type BulkGroupCandidate,
  type BulkSkipReason,
} from '@/lib/task-groups'

export type BulkNotRequiredResult =
  | {
      ok: true
      completed: string[]
      skipped: { taskId: string; reason: BulkSkipReason }[]
      requiresNote: boolean
    }
  | { ok: false; status: number; error: string; skipped?: { taskId: string; reason: BulkSkipReason }[] }

function policyList(checklist: ApplicableChecklist): OutcomePolicyChecklist {
  return {
    name: checklist.name,
    appearFromTime: checklist.appearFromTime,
    activatedOn: checklist.activatedOn,
    schedules: checklist.schedules,
    events: checklist.events,
    allowedOutcomes: checklist.allowedOutcomes,
    requireOutcomeReason: checklist.requireOutcomeReason,
  }
}

export async function bulkNotRequiredGroup(input: {
  staffId: string
  venueId: string
  departmentId: string | null
  checklistId: string
  groupLabel: string
  taskIds?: string[] | null
  note?: string | null
}): Promise<BulkNotRequiredResult> {
  const label = normaliseGroupLabel(input.groupLabel)
  if (!label) return { ok: false, status: 400, error: 'GROUP LABEL IS REQUIRED' }

  const venue = await prisma.venue.findUnique({
    where: { id: input.venueId },
    select: { timezone: true },
  })
  const today = getTodayDate(venue?.timezone)
  const todayKey = formatDateKey(today)
  const nowHHmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: venue?.timezone ?? 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const dayOfWeek = weekdayOf(today)

  // The list must be visible to this worker (same audience rules as the task
  // list), and open now — a closed list is not on the floor to act on.
  const { checklists } = await applicableChecklistsForStaff({
    staffId: input.staffId,
    venueId: input.venueId,
    departmentId: input.departmentId,
  })
  const checklist = checklists.find((c) => c.id === input.checklistId)
  if (!checklist) return { ok: false, status: 404, error: 'Not found' }
  const open = isChecklistOpen(
    checklist.appearFromTime,
    checklist.activatedOn,
    today,
    nowHHmm,
    checklist.schedules,
    dayOfWeek,
    checklist.events,
  )
  if (!open) return { ok: false, status: 409, error: 'THIS LIST IS NOT OPEN' }

  const groupTaskIds = new Set(
    checklist.tasks
      .filter((task) => normaliseGroupLabel(task.groupLabel) === label)
      .map((task) => task.taskId),
  )
  if (groupTaskIds.size === 0) return { ok: false, status: 404, error: 'GROUP NOT FOUND IN THIS LIST' }

  // An optional subset lets the UI act on a visible slice. Anything outside the
  // group is rejected rather than silently ignored.
  const provided = input.taskIds == null
    ? null
    : [...new Set(input.taskIds.filter(Boolean))]
  if (provided && provided.some((id) => !groupTaskIds.has(id))) {
    return { ok: false, status: 400, error: 'ONE OR MORE TASKS ARE NOT IN THIS GROUP' }
  }
  const candidateIds = provided ?? [...groupTaskIds]

  const [tasks, completions] = await Promise.all([
    prisma.task.findMany({
      // Only live, floor-visible tasks. A hand-crafted call cannot settle a
      // DRAFT/ARCHIVED or deactivated task that the worker list never shows.
      where: {
        id: { in: candidateIds },
        venueId: input.venueId,
        deletedAt: null,
        isActive: true,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        scheduleType: true,
        scheduleDays: true,
        customCron: true,
        intervalMonths: true,
        monthlyOption: true,
        monthlyDay: true,
        createdAt: true,
        isOneOff: true,
        dueDate: true,
        rolloverEnabled: true,
        allowedOutcomes: true,
        overrideOutcomes: true,
        requireOutcomeReason: true,
        progress: { select: { progressDate: true } },
      },
    }),
    prisma.taskCompletion.findMany({
      where: { taskId: { in: candidateIds }, scheduledDate: today, deletedAt: null },
      select: { taskId: true },
    }),
  ])
  const settled = new Set(completions.map((c) => c.taskId))

  // Build the per-task policy from the same applicable lists the worker sees,
  // so a task that excludes NOT_REQUIRED (task override) is reported, not forced.
  const candidates: BulkGroupCandidate[] = tasks.map((task) => {
    const listsForTask = checklists.filter((c) => c.tasks.some((t) => t.taskId === task.id))
    const policy = resolveOutcomePolicyForChecklists(task, listsForTask.map(policyList), { today, nowHHmm })
    return {
      taskId: task.id,
      isSettled: settled.has(task.id),
      visibleToday: carryTaskToday({
        isDueToday: isTaskDueOnDate(task, today),
        progress: task.progress,
        todayKey,
        // Match the worker GET: a live PARTIAL carries when ANY applicable list
        // is multi-day, not just the list the bulk action was started from.
        multiDay: listsForTask.some((c) => c.multiDay),
      }),
      allowsNotRequired: policy.allowed.includes('NOT_REQUIRED' as TaskOutcome),
      requireReason: policy.requireReason,
    }
  })

  // A task listed in the group but deleted/DRAFT/inactive never made it into
  // `tasks`, so it is simply not written. Nothing is invented or forced.
  const plan = planBulkNotRequired(candidates, input.note)
  if (plan.reasonMissing) {
    return {
      ok: false,
      status: 422,
      error: 'A REASON IS REQUIRED',
      skipped: plan.skipped,
    }
  }
  if (plan.eligible.length === 0) {
    return { ok: true, completed: [], skipped: plan.skipped, requiresNote: plan.requiresNote }
  }

  const note = input.note?.trim() || null
  await prisma.$transaction(async (tx) => {
    for (const taskId of plan.eligible) {
      await tx.taskCompletion.create({
        data: {
          taskId,
          staffId: input.staffId,
          scheduledDate: today,
          note,
          outcome: 'NOT_REQUIRED',
        },
      })
    }
    // A terminal outcome ends any in-progress state for these tasks.
    await tx.taskProgress.deleteMany({ where: { taskId: { in: plan.eligible } } })
  })

  return {
    ok: true,
    completed: plan.eligible,
    skipped: plan.skipped,
    requiresNote: plan.requiresNote,
  }
}
