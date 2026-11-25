/**
 * Custom / ad-hoc task membership (#145 Wave A).
 *
 * A task belongs in the combined CUSTOM TASKS bucket when it is a one-off OR it
 * is assigned to the person looking at it — but never when it already lives in a
 * checklist, because tasks in a list stay in that list and must not be
 * duplicated. This file is Prisma-free so the worker route, the admin task page
 * and component tests all share one rule.
 */

export interface CustomTaskLike {
  id: string
  isOneOff?: boolean | null
  assignedToStaffId?: string | null
}

export interface CustomTaskOptions {
  /** Seeing "assigned to me" — the signed-in staff member id. */
  staffId?: string | null
  /** Admin view: any assignment (not just mine) counts as a custom task. */
  anyAssignee?: boolean
  /** Task ids that appear in any applicable checklist — always excluded. */
  checklistTaskIds?: ReadonlySet<string> | null
}

function isAssignedToViewer(task: CustomTaskLike, opts: CustomTaskOptions): boolean {
  if (!task.assignedToStaffId) return false
  if (opts.anyAssignee) return true
  return !!opts.staffId && task.assignedToStaffId === opts.staffId
}

/** Membership in the combined custom-task bucket. */
export function isCustomTask(task: CustomTaskLike, opts: CustomTaskOptions = {}): boolean {
  if (!task?.id) return false
  if (opts.checklistTaskIds?.has(task.id)) return false
  return !!task.isOneOff || isAssignedToViewer(task, opts)
}

export interface CustomTaskGroup<T> {
  /** Stable group key (department name based). */
  key: string
  name: string
  tasks: T[]
}

/**
 * Filter to the custom bucket and group by department, preserving the input
 * order inside each group and dropping duplicate task ids. Groups appear in the
 * order their first task is seen, so the result is stable across renders.
 */
export function groupCustomTasks<T extends CustomTaskLike & { departmentName?: string | null }>(
  tasks: readonly T[],
  opts: CustomTaskOptions = {},
): CustomTaskGroup<T>[] {
  const groups = new Map<string, CustomTaskGroup<T>>()
  const seen = new Set<string>()
  for (const task of tasks) {
    if (seen.has(task.id)) continue
    if (!isCustomTask(task, opts)) continue
    seen.add(task.id)
    const name = task.departmentName ?? 'GENERAL'
    const key = `custom:${name}`
    let group = groups.get(key)
    if (!group) {
      group = { key, name, tasks: [] }
      groups.set(key, group)
    }
    group.tasks.push(task)
  }
  return [...groups.values()]
}

export type DueDateParse = { ok: true; value: Date | null } | { ok: false; value: null }

/**
 * Parse a date-only due date (`YYYY-MM-DD`, optionally an ISO datetime whose
 * date part is used) into the UTC-anchored calendar date `@db.Date` stores.
 * Empty / null clears the date; a malformed or impossible date is rejected.
 */
export function parseDueDate(input: unknown): DueDateParse {
  if (input === null || input === undefined || input === '') return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, value: null }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(input.trim())
  if (!match) return { ok: false, value: null }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, value: null }
  }
  return { ok: true, value: date }
}
