// Checklist task groups: a free-text label on ChecklistTask that lets a worker
// settle a whole set of conditionally-needed tasks (e.g. the outside deck in
// bad weather) as NOT_REQUIRED in one action.
//
// Grouping is CHECKLIST-SCOPED. The same task can be ungrouped — or in a
// different group — on another list. Prisma-free and client-safe: the worker
// list renders groups in the browser and the server half lives in
// `task-groups.server.ts`.

/** Longest group label kept. Keeps labels readable in a group header. */
export const MAX_GROUP_LABEL_LENGTH = 40

/** Trim, collapse whitespace and uppercase a group label. Blank becomes null. */
export function normaliseGroupLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const label = raw.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, MAX_GROUP_LABEL_LENGTH).trim()
  return label ? label : null
}

/**
 * Safely read a `{ taskId: label }` map from a request body. Unknown shapes
 * become an empty map so a bad client payload cannot write a group by accident.
 */
export function parseTaskGroups(raw: unknown): Record<string, string | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = normaliseGroupLabel(value)
  }
  return out
}

export interface LabeledTask {
  id: string
  groupLabel?: string | null
}

/** Distinct group labels in first-seen order (blank/normalised duplicates merged). */
export function groupLabels<T extends LabeledTask>(tasks: readonly T[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const task of tasks) {
    const label = normaliseGroupLabel(task.groupLabel)
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

export interface TaskBucket<T> {
  label: string | null
  tasks: T[]
}

/**
 * Split tasks into their groups, preserving input order inside each bucket and
 * the first-seen order of the groups. Ungrouped tasks come back as one bucket
 * with `label: null` (and only when there are any).
 */
export function groupChecklistTasks<T extends LabeledTask>(tasks: readonly T[]): TaskBucket<T>[] {
  const ungrouped: T[] = []
  const byLabel = new Map<string, T[]>()
  for (const task of tasks) {
    const label = normaliseGroupLabel(task.groupLabel)
    if (!label) {
      ungrouped.push(task)
      continue
    }
    const bucket = byLabel.get(label)
    if (bucket) bucket.push(task)
    else byLabel.set(label, [task])
  }
  const groups: TaskBucket<T>[] = [...byLabel.entries()].map(([label, groupTasks]) => ({
    label,
    tasks: groupTasks,
  }))
  return ungrouped.length ? [{ label: null, tasks: ungrouped }, ...groups] : groups
}

export type BulkSkipReason =
  | 'ALREADY SETTLED'
  | 'NOT DUE TODAY'
  | 'NOT REQUIRED NOT AVAILABLE'

export interface BulkGroupCandidate {
  taskId: string
  /** A live completion already exists for the venue-local day. */
  isSettled: boolean
  /** Due today, or carried by a live PARTIAL on a multi-day list. */
  visibleToday: boolean
  /** The resolved outcome policy allows NOT_REQUIRED. */
  allowsNotRequired: boolean
  /** The resolved policy requires a note for a non-DONE outcome. */
  requireReason: boolean
}

export interface BulkGroupPlan {
  eligible: string[]
  skipped: { taskId: string; reason: BulkSkipReason }[]
  /** At least one eligible task makes a note mandatory. */
  requiresNote: boolean
  /** A note is required and the supplied one is blank. */
  reasonMissing: boolean
}

/**
 * Decide which tasks a bulk "mark group not required" action may settle.
 * Pure: the caller supplies the resolved policy per task so the plan cannot
 * drift from what the worker was shown.
 */
export function planBulkNotRequired(
  candidates: readonly BulkGroupCandidate[],
  note?: string | null,
): BulkGroupPlan {
  const eligible: string[] = []
  const skipped: { taskId: string; reason: BulkSkipReason }[] = []
  let requiresNote = false

  for (const candidate of candidates) {
    if (candidate.isSettled) {
      skipped.push({ taskId: candidate.taskId, reason: 'ALREADY SETTLED' })
      continue
    }
    if (!candidate.visibleToday) {
      skipped.push({ taskId: candidate.taskId, reason: 'NOT DUE TODAY' })
      continue
    }
    if (!candidate.allowsNotRequired) {
      skipped.push({ taskId: candidate.taskId, reason: 'NOT REQUIRED NOT AVAILABLE' })
      continue
    }
    eligible.push(candidate.taskId)
    if (candidate.requireReason) requiresNote = true
  }

  const hasNote = !!note?.trim()
  return {
    eligible,
    skipped,
    requiresNote,
    reasonMissing: requiresNote && !hasNote,
  }
}
