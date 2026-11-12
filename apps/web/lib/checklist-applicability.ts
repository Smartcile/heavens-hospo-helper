import type { Prisma } from '@hospo-ops/db'

export interface ChecklistApplicabilityScope {
  /** Home department plus every department linked to it. Null when the staff member has no department. */
  departmentIds: string[] | null
  sectionIds: string[]
  positionIds: string[]
  /** Only lists containing this task (completion endpoint). */
  taskId?: string | null
}

/**
 * The venue / audience filter shared by the worker task list and the completion
 * endpoint. `departmentIds` is the staff member's home department PLUS every
 * department linked to it — the same scope the worker task query uses, so a
 * DEPARTMENT audience cannot point at a department the staff member can already
 * see tasks from while hiding the list those tasks belong to.
 */
export function checklistApplicabilityWhere(
  venueId: string,
  scope: ChecklistApplicabilityScope,
): Prisma.ChecklistWhereInput {
  const { departmentIds, sectionIds, positionIds, taskId } = scope

  return {
    deletedAt: null,
    isActive: true,
    venueId,
    ...(taskId ? { tasks: { some: { taskId } } } : {}),
    OR: [
      ...(departmentIds
        ? [{ departmentId: { in: departmentIds }, audiences: { none: {} } }]
        : []),
      { departmentId: null, audiences: { none: {} } },
      ...(departmentIds
        ? [
            {
              audiences: {
                some: { kind: 'DEPARTMENT' as const, targetId: { in: departmentIds } },
              },
            },
          ]
        : []),
      ...(sectionIds.length
        ? [
            {
              audiences: {
                some: { kind: 'SECTION' as const, targetId: { in: sectionIds } },
              },
            },
          ]
        : []),
      ...(positionIds.length
        ? [
            {
              audiences: {
                some: { kind: 'POSITION' as const, targetId: { in: positionIds } },
              },
            },
          ]
        : []),
    ],
  }
}
