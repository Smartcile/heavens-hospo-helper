// Which checklists apply to a staff member. This is the single place the
// department / linked-department / section / position audience rules live, so
// the worker task list and the completion endpoint cannot drift apart (a task
// must not offer an outcome in the UI that the server then rejects).

import { prisma } from '@hospo-ops/db'
import type { TaskOutcome } from '@/lib/task-outcomes'

export interface ApplicableChecklist {
  id: string
  name: string
  appearFromTime: string | null
  activatedOn: Date | null
  allowedOutcomes: TaskOutcome[]
  requireOutcomeReason: boolean
  tasks: { taskId: string }[]
}

export async function applicableChecklistsForStaff(opts: {
  staffId: string
  venueId: string
  departmentId: string | null
  /** Pass when the caller already resolved linked departments (worker task GET). */
  linkedDepartmentIds?: string[]
  /** Only lists containing this task (completion endpoint). */
  taskId?: string
}): Promise<{ checklists: ApplicableChecklist[]; departmentIds: string[] | null }> {
  let linkedDepartmentIds = opts.linkedDepartmentIds
  if (linkedDepartmentIds === undefined) {
    linkedDepartmentIds = opts.departmentId
      ? (
          await prisma.departmentLink.findMany({
            where: { fromDepartmentId: opts.departmentId },
            select: { toDepartmentId: true },
          })
        ).map((l) => l.toDepartmentId)
      : []
  }

  const departmentIds = opts.departmentId
    ? [opts.departmentId, ...linkedDepartmentIds]
    : null

  const staffCtx = await prisma.staff.findUnique({
    where: { id: opts.staffId },
    select: {
      sections: { select: { sectionId: true } },
      positions: { select: { positionId: true } },
    },
  })
  const sectionIds = (staffCtx?.sections ?? []).map((s) => s.sectionId)
  const positionIds = (staffCtx?.positions ?? []).map((p) => p.positionId)

  const checklists = await prisma.checklist.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      venueId: opts.venueId,
      ...(opts.taskId ? { tasks: { some: { taskId: opts.taskId } } } : {}),
      OR: [
        ...(departmentIds ? [{ departmentId: { in: departmentIds }, audiences: { none: {} } }] : []),
        { departmentId: null, audiences: { none: {} } },
        ...(opts.departmentId
          ? [{ audiences: { some: { kind: 'DEPARTMENT' as const, targetId: opts.departmentId } } }]
          : []),
        ...(sectionIds.length
          ? [{ audiences: { some: { kind: 'SECTION' as const, targetId: { in: sectionIds } } } }]
          : []),
        ...(positionIds.length
          ? [{ audiences: { some: { kind: 'POSITION' as const, targetId: { in: positionIds } } } }]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      appearFromTime: true,
      activatedOn: true,
      allowedOutcomes: true,
      requireOutcomeReason: true,
      tasks: { select: { taskId: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ appearFromTime: 'asc' }, { name: 'asc' }],
  })

  return { checklists, departmentIds }
}
