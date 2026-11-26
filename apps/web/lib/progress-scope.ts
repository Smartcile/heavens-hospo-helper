// Role-aware day progress (#143). Prisma-free so the worker header, the
// dashboard tile and any future admin read share one rule.
//
// A floored STAFF member only counts work they can actually see: tasks in a
// list that is open right now, tasks in no list, and work that is already
// settled (a finished task stays in the count when its list closes later, so
// the bar cannot drop back to a lower figure by accident). A closed list whose
// tasks are still waiting is not in a STAFF denominator — that is what lets
// finishing every 07:00 list read 100%, then re-bases when the next list
// unlocks. ADMIN / MANAGER see the whole day.
//
// A checklist can opt out of the aggregate (`excludeFromProgress`, e.g. side
// work). Both roles drop it. A task that is also in another list that DOES
// count still counts through that list.

export type ProgressScope = 'STAFF' | 'MANAGER'

export interface ProgressTaskLike {
  id: string
  /** True only when the recorded outcome is DONE. */
  isDone: boolean
  /** Settled = DONE / NOT_REQUIRED / DID_NOT_COMPLETE. */
  isSettled?: boolean
}

export interface ProgressChecklistLike {
  id: string
  taskIds: readonly string[]
  /** Server verdict — see lib/checklist-activation. */
  openNow: boolean
  excludeFromProgress?: boolean
}

export interface ProgressScopeResult {
  total: number
  done: number
  scope: ProgressScope
}

/** ADMIN / MANAGER see the whole day; everyone else sees the unlocked floor. */
export function isManagerRole(role: string | null | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

/**
 * The day's progress denominator/numerator for the given role.
 *
 * `todayKey` is accepted so a future day-aware rule has one input; the current
 * rule only needs the server-computed `openNow` verdict.
 */
export function progressScope(opts: {
  tasks: readonly ProgressTaskLike[]
  checklists: readonly ProgressChecklistLike[]
  role: string | null | undefined
  todayKey?: string
}): ProgressScopeResult {
  const scope: ProgressScope = isManagerRole(opts.role) ? 'MANAGER' : 'STAFF'

  const listsByTask = new Map<string, ProgressChecklistLike[]>()
  for (const cl of opts.checklists) {
    for (const taskId of cl.taskIds) {
      const arr = listsByTask.get(taskId) ?? []
      arr.push(cl)
      listsByTask.set(taskId, arr)
    }
  }

  let total = 0
  let done = 0
  for (const task of opts.tasks) {
    const lists = listsByTask.get(task.id) ?? []

    // Excluded only when EVERY list holding the task opts out — another list
    // that does count still includes the work.
    if (lists.length > 0 && lists.every((l) => !!l.excludeFromProgress)) continue

    if (scope === 'STAFF') {
      const visible = lists.length === 0 || lists.some((l) => l.openNow) || !!task.isSettled
      if (!visible) continue
    }

    total++
    if (task.isDone) done++
  }

  return { total, done, scope }
}
