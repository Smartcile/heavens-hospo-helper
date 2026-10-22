// Worker task outcomes, shared by the worker UI, the admin editors and the API
// routes. Prisma-free on purpose: the worker task list is a client component.
//
// Hierarchy: checklist defaults → task override → all outcomes. DONE is always
// allowed, so a task can never be left un-finishable. PARTIAL is not terminal —
// it lives in TaskProgress and keeps the task on the floor across refreshes.

import { isChecklistOpen } from '@/lib/checklist-activation'

export const TASK_OUTCOMES = ['DONE', 'PARTIAL', 'NOT_REQUIRED', 'DID_NOT_COMPLETE'] as const

export type TaskOutcome = (typeof TASK_OUTCOMES)[number]

export const OUTCOME_LABELS: Record<TaskOutcome, string> = {
  DONE: 'DONE',
  PARTIAL: 'PARTIAL',
  NOT_REQUIRED: 'NOT REQUIRED',
  DID_NOT_COMPLETE: 'DID NOT COMPLETE',
}

export const OUTCOME_DESCRIPTIONS: Record<TaskOutcome, string> = {
  DONE: 'Completed the task',
  PARTIAL: 'Started, but not finished — stays on the list',
  NOT_REQUIRED: 'No longer needed for this period',
  DID_NOT_COMPLETE: 'Was not done',
}

export function isTaskOutcome(value: unknown): value is TaskOutcome {
  return typeof value === 'string' && (TASK_OUTCOMES as readonly string[]).includes(value)
}

/** Every outcome is valid, in display order, always including DONE. */
export function normaliseOutcomes(allowed?: readonly TaskOutcome[] | null): TaskOutcome[] {
  // null/undefined = "not configured" → all outcomes. An explicit empty array
  // is "only DONE" (used by a task override that disables every extra option).
  if (allowed == null) return [...TASK_OUTCOMES]
  const set = new Set<TaskOutcome>(['DONE'])
  for (const value of allowed) {
    if (isTaskOutcome(value)) set.add(value)
  }
  return TASK_OUTCOMES.filter((outcome) => set.has(outcome))
}

export interface OutcomePolicyTask {
  overrideOutcomes?: boolean | null
  allowedOutcomes?: readonly TaskOutcome[] | null
  requireOutcomeReason?: boolean | null
}

export interface OutcomePolicyList {
  allowedOutcomes?: readonly TaskOutcome[] | null
  requireOutcomeReason?: boolean | null
}

export interface OutcomePolicyChecklist extends OutcomePolicyList {
  name: string
  appearFromTime?: string | null
  activatedOn?: Date | string | null
}

export interface ResolvedOutcomePolicy {
  allowed: TaskOutcome[]
  requireReason: boolean
  source: 'TASK' | 'LIST' | 'DEFAULT'
}

/**
 * Resolve the effective outcome policy. A task with `overrideOutcomes` wins;
 * otherwise the first applicable checklist supplies the defaults; otherwise all
 * outcomes are available and no reason is required.
 */
export function resolveOutcomePolicy(
  task: OutcomePolicyTask,
  list?: OutcomePolicyList | null,
): ResolvedOutcomePolicy {
  if (task.overrideOutcomes) {
    return {
      allowed: normaliseOutcomes(task.allowedOutcomes),
      requireReason: !!task.requireOutcomeReason,
      source: 'TASK',
    }
  }
  if (list) {
    return {
      // A checklist's empty array is its default "not configured" value, so it
      // means all outcomes. (A task override's empty array is explicit: DONE only.)
      allowed: list.allowedOutcomes && list.allowedOutcomes.length > 0
        ? normaliseOutcomes(list.allowedOutcomes)
        : normaliseOutcomes(null),
      requireReason: !!list.requireOutcomeReason,
      source: 'LIST',
    }
  }
  return {
    allowed: normaliseOutcomes(null),
    requireReason: false,
    source: 'DEFAULT',
  }
}

/** Terminal outcomes settle the day. PARTIAL does not. */
export function isTerminalOutcome(outcome: TaskOutcome): boolean {
  return outcome !== 'PARTIAL'
}

/** Only DONE counts towards completion metrics. */
export function isDoneOutcome(outcome: TaskOutcome | null | undefined): boolean {
  return outcome === 'DONE'
}

/**
 * Pick the checklist whose policy applies to a task. The worker groups a task
 * under the first OPEN list (earliest appear-from, then name), so policy follows
 * the same rule. If no list is open yet, fall back to the first list by time.
 */
export function resolveOutcomePolicyForChecklists(
  task: OutcomePolicyTask,
  checklists: readonly OutcomePolicyChecklist[],
  ctx: { today: Date | string; nowHHmm: string },
): ResolvedOutcomePolicy {
  if (task.overrideOutcomes) return resolveOutcomePolicy(task, null)

  const sorted = [...checklists].sort(
    (a, b) =>
      (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? '') ||
      a.name.localeCompare(b.name),
  )
  const open = sorted.filter((c) => isChecklistOpen(c.appearFromTime, c.activatedOn, ctx.today, ctx.nowHHmm))
  const chosen = open[0] ?? sorted[0] ?? null
  return resolveOutcomePolicy(task, chosen)
}

/** Returns an error message, or null when the choice is valid. */
export function outcomeValidationError(input: {
  outcome: unknown
  allowed: readonly TaskOutcome[]
  requireReason: boolean
  note?: string | null
}): string | null {
  if (!isTaskOutcome(input.outcome)) return 'INVALID OUTCOME'
  if (!input.allowed.includes(input.outcome)) {
    return `${OUTCOME_LABELS[input.outcome]} IS NOT AVAILABLE FOR THIS TASK`
  }
  if (input.outcome !== 'DONE' && input.requireReason && !(input.note ?? '').trim()) {
    return 'A REASON IS REQUIRED'
  }
  return null
}
