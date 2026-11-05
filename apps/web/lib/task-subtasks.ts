// Linked subtasks (Issue #68, Phase 4). Prisma-free so both task UIs and the
// route handlers can share the same depth-1 rules.
//
// A task may have at most one parent, and a task that already has a parent can
// never be given a parent of its own. Parents stay normal completable tasks;
// children are normal tasks too, and each can sit in any checklist independently.

export interface ParentTaskRef {
  id: string
  venueId: string
  parentTaskId?: string | null
}

export interface SubtaskTaskLike {
  id: string
  title?: string
  venueId: string
  parentTaskId?: string | null
}

/** Returns an error message, or null when the proposed parent link is valid. */
export function validateParentTask(input: {
  taskId?: string | null
  taskVenueId: string
  /** True when the task being edited already has children of its own. */
  childHasSubtasks?: boolean
  /** The proposed parent (undefined/null = clear the link). */
  parent?: ParentTaskRef | null
  /** False when the parent id could not be found (or was soft-deleted). */
  parentExists?: boolean
}): string | null {
  if (input.parentExists === false) return 'PARENT TASK NOT FOUND'
  const parent = input.parent
  if (!parent) return null
  if (input.taskId && parent.id === input.taskId) return 'A TASK CANNOT BE ITS OWN PARENT'
  if (parent.venueId !== input.taskVenueId) return 'PARENT TASK MUST BE IN THE SAME VENUE'
  if (parent.parentTaskId) return 'SUBTASKS CANNOT HAVE THEIR OWN SUBTASKS'
  if (input.childHasSubtasks) return 'A TASK WITH SUBTASKS CANNOT BECOME A SUBTASK'
  return null
}

/**
 * Tasks that can be chosen as a parent for `taskId`: same venue, top-level
 * only (a subtask cannot become a parent), and never the task itself.
 */
export function availableParentTasks<T extends SubtaskTaskLike>(
  tasks: readonly T[],
  opts: { venueId: string; taskId?: string | null },
): T[] {
  return tasks.filter(
    (t) => t.venueId === opts.venueId && t.id !== opts.taskId && !t.parentTaskId,
  )
}

export interface OrderedTask<T> {
  task: T
  /** 0 = top-level, 1 = subtask. */
  depth: number
  parent: T | null
}

/**
 * Order a set of tasks so a child follows its parent, with a depth for
 * indentation. Tasks whose parent is not in the set are still returned (as
 * top-level rows) — they are shown elsewhere with a "PART OF" label instead of
 * being dropped.
 */
export function orderTasksWithChildren<T extends { id: string; parentTaskId?: string | null }>(
  tasks: readonly T[],
): OrderedTask<T>[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const childrenByParent = new Map<string, T[]>()
  const roots: T[] = []

  for (const task of tasks) {
    const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined
    if (parent) {
      const children = childrenByParent.get(parent.id) ?? []
      children.push(task)
      childrenByParent.set(parent.id, children)
    } else {
      roots.push(task)
    }
  }

  const out: OrderedTask<T>[] = []
  const seen = new Set<string>()
  const emit = (task: T, depth: number, parent: T | null) => {
    if (seen.has(task.id)) return
    seen.add(task.id)
    out.push({ task, depth, parent })
    for (const child of childrenByParent.get(task.id) ?? []) {
      emit(child, depth + 1, task)
    }
  }
  for (const root of roots) emit(root, 0, null)
  // Orphaned children (their parent is not in this set) still render.
  for (const task of tasks) emit(task, 0, null)
  return out
}

/** Ids of subtasks that are not in the provided same-list id set. */
export function subtasksOutsideList(
  subtaskIds: readonly string[],
  sameListIds: readonly string[],
): string[] {
  const inList = new Set(sameListIds)
  return subtaskIds.filter((id) => !inList.has(id))
}
