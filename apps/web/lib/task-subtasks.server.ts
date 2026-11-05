import { prisma } from '@hospo-ops/db'
import { validateParentTask } from '@/lib/task-subtasks'

/**
 * Validate a proposed parent link against the database. Returns an error
 * message or null. Prisma lives here so `task-subtasks.ts` stays client-safe.
 */
export async function parentLinkError(opts: {
  parentTaskId?: string | null
  taskId?: string | null
  taskVenueId: string
  childHasSubtasks?: boolean
}): Promise<string | null> {
  if (!opts.parentTaskId) return null
  const parent = await prisma.task.findFirst({
    where: { id: opts.parentTaskId, deletedAt: null },
    select: { id: true, venueId: true, parentTaskId: true },
  })
  return validateParentTask({
    taskId: opts.taskId,
    taskVenueId: opts.taskVenueId,
    childHasSubtasks: opts.childHasSubtasks,
    parent,
    parentExists: !!parent,
  })
}

/** The next ordering slot for a child of this parent. */
export async function nextSubtaskOrder(parentTaskId: string): Promise<number> {
  const last = await prisma.task.findFirst({
    where: { parentTaskId, deletedAt: null },
    orderBy: { subtaskOrder: 'desc' },
    select: { subtaskOrder: true },
  })
  return (last?.subtaskOrder ?? -1) + 1
}

/** True when the task has at least one live child. */
export async function hasLiveSubtasks(taskId: string): Promise<boolean> {
  const child = await prisma.task.findFirst({
    where: { parentTaskId: taskId, deletedAt: null },
    select: { id: true },
  })
  return !!child
}

/**
 * Soft-delete a task. Children are unparented first so they remain usable as
 * top-level tasks (never hard-delete, never cascade-delete).
 */
export async function softDeleteTask(taskId: string, alsoDeactivate = false): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { parentTaskId: taskId },
      data: { parentTaskId: null },
    })
    await tx.task.update({
      where: { id: taskId },
      data: {
        deletedAt: new Date(),
        ...(alsoDeactivate ? { isActive: false } : {}),
      },
    })
  })
}
