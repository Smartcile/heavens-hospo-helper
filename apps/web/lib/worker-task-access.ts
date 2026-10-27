// Worker-side task/checklist authoring. Mirrors `worker-guide-access.ts`: an
// unrestricted ADMIN/MANAGER always passes; floor STAFF need the matching
// `execution.tasks.*` grants set on the Staff page (ACCESS → DAILY TASKS).
//
// Pure on purpose — the worker task list is a client component and must not
// drag the pg driver into the browser bundle. The DB half is
// `worker-task-access.server.ts`.

export interface WorkerTaskAccess {
  canCreateTask: boolean
  canEditTask: boolean
  canDeleteTask: boolean
  canCreateList: boolean
  canEditList: boolean
  canDeleteList: boolean
  /** Any authoring ability — controls EDIT MODE and the authoring data loads. */
  canAuthor: boolean
}

export const EMPTY_WORKER_TASK_ACCESS: WorkerTaskAccess = {
  canCreateTask: false,
  canEditTask: false,
  canDeleteTask: false,
  canCreateList: false,
  canEditList: false,
  canDeleteList: false,
  canAuthor: false,
}

export const FULL_WORKER_TASK_ACCESS: WorkerTaskAccess = {
  canCreateTask: true,
  canEditTask: true,
  canDeleteTask: true,
  canCreateList: true,
  canEditList: true,
  canDeleteList: true,
  canAuthor: true,
}

/**
 * Resolve a worker's authoring flags from their role + grants.
 *
 * List create accepts CREATE **or** EDIT: the admin API has always guarded
 * checklist creation with `execution.tasks.edit`, and product approved the OR
 * so an editor can build a list without also being a task creator.
 */
export function resolveWorkerTaskAccess(
  role: string | null | undefined,
  grants: readonly string[],
): WorkerTaskAccess {
  if (role === 'ADMIN' || role === 'MANAGER') return { ...FULL_WORKER_TASK_ACCESS }

  const set = new Set(grants)
  const canCreateTask = set.has('execution.tasks.create')
  const canEditTask = set.has('execution.tasks.edit')
  const canDeleteTask = set.has('execution.tasks.delete')
  const canEditList = canEditTask
  const canCreateList = canCreateTask || canEditTask
  const canDeleteList = canDeleteTask

  return {
    canCreateTask,
    canEditTask,
    canDeleteTask,
    canCreateList,
    canEditList,
    canDeleteList,
    canAuthor:
      canCreateTask || canEditTask || canDeleteTask || canCreateList || canEditList || canDeleteList,
  }
}
