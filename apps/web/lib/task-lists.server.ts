import { prisma } from '@hospo-ops/db'

/**
 * Sync which checklists ("lists") a task appears in.
 *
 * Only this task's own `ChecklistTask` rows are touched, so editing one task
 * never overwrites another task's membership or a concurrent list edit. Every
 * requested list must belong to the task's venue.
 *
 * Returns a 400 message on a cross-venue list, or null on success.
 */
export async function syncTaskLists(input: {
  taskId: string
  venueId: string
  checklistIds: readonly string[]
}): Promise<string | null> {
  const ids = [...new Set(input.checklistIds.filter(Boolean))]

  if (ids.length > 0) {
    const count = await prisma.checklist.count({
      where: { id: { in: ids }, venueId: input.venueId, deletedAt: null },
    })
    if (count !== ids.length) return 'ONE OR MORE LISTS ARE NOT IN THIS VENUE'
  }

  const existing = await prisma.checklistTask.findMany({
    where: { taskId: input.taskId },
    select: { checklistId: true },
  })
  const existingIds = new Set(existing.map((row) => row.checklistId))

  await prisma.$transaction(async (tx) => {
    await tx.checklistTask.deleteMany({
      where: { taskId: input.taskId, checklistId: { notIn: ids } },
    })
    for (const checklistId of ids) {
      if (existingIds.has(checklistId)) continue
      const last = await tx.checklistTask.findFirst({
        where: { checklistId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      await tx.checklistTask.create({
        data: { checklistId, taskId: input.taskId, sortOrder: (last?.sortOrder ?? -1) + 1 },
      })
    }
  })

  return null
}

/** Checklist ids a task currently belongs to. */
export async function taskListIds(taskId: string): Promise<string[]> {
  const rows = await prisma.checklistTask.findMany({
    where: { taskId },
    select: { checklistId: true },
  })
  return rows.map((row) => row.checklistId)
}
