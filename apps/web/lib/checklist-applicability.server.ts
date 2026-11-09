// Which checklists apply to a staff member. This is the single place the
// department / linked-department / section / position audience rules live, so
// the worker task list and the completion endpoint cannot drift apart (a task
// must not offer an outcome in the UI that the server then rejects).

import { prisma } from '@hospo-ops/db'
import type { TaskOutcome } from '@/lib/task-outcomes'
import type { ChecklistEventWindow, ChecklistScheduleWindow } from '@/lib/checklist-activation'

export interface ApplicableChecklistEvent extends ChecklistEventWindow {
  id: string
  venueId: string
  title: string
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
}

export interface ApplicableChecklist {
  id: string
  name: string
  appearFromTime: string | null
  activatedOn: Date | null
  schedules: ChecklistScheduleWindow[]
  events: ApplicableChecklistEvent[]
  allowedOutcomes: TaskOutcome[]
  requireOutcomeReason: boolean
  /** SIDE WORK / MULTI-DAY — partials stay live until a terminal outcome. */
  multiDay: boolean
  tasks: { taskId: string; groupLabel: string | null }[]
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
      schedules: {
        where: { deletedAt: null },
        select: { dayOfWeek: true, fromTime: true, toTime: true },
        orderBy: [{ dayOfWeek: 'asc' }, { fromTime: 'asc' }],
      },
      events: {
        // Include links to soft-deleted events: the pure rule treats them as
        // closed, and keeping the row stops a deleted-only list from falling
        // back to "no gate = always open".
        where: { deletedAt: null },
        select: {
          calendarEvent: {
            select: {
              id: true,
              venueId: true,
              title: true,
              startsAt: true,
              endsAt: true,
              allDay: true,
              deletedAt: true,
            },
          },
        },
        orderBy: { calendarEvent: { startsAt: 'asc' } },
      },
      allowedOutcomes: true,
      requireOutcomeReason: true,
      multiDay: true,
      tasks: { select: { taskId: true, groupLabel: true }, orderBy: { sortOrder: 'asc' } },
    },
    orderBy: [{ appearFromTime: 'asc' }, { name: 'asc' }],
  })

  return {
    checklists: checklists.map((c) => ({
      ...c,
      events: c.events.map((e) => e.calendarEvent),
    })),
    departmentIds,
  }
}
