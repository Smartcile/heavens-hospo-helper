// Report filters, kept pure so the DONE-only rule is tested and can never
// drift from the dashboard (which counts DONE only). `all` still lists every
// outcome for audit; `done` is the completion metric.

export interface CompletionReportInput {
  venueId?: string | null
  departmentId?: string | null
  staffId?: string | null
  from?: string | null
  to?: string | null
  /** A MANAGER is pinned to their own venue regardless of the query string. */
  managerVenueId?: string | null
}

export interface CompletionReportWhere {
  outcome?: 'DONE'
  task?: { venueId?: string; departmentId?: string }
  staffId?: string
  scheduledDate?: { gte?: Date; lte?: Date }
}

export function completionReportWheres(input: CompletionReportInput): {
  all: CompletionReportWhere
  done: CompletionReportWhere
} {
  const task: { venueId?: string; departmentId?: string } = {}
  const venueId = input.managerVenueId ?? input.venueId
  if (venueId) task.venueId = venueId
  if (input.departmentId) task.departmentId = input.departmentId

  const where: CompletionReportWhere = {}
  if (Object.keys(task).length > 0) where.task = task
  if (input.staffId) where.staffId = input.staffId

  const scheduledDate: { gte?: Date; lte?: Date } = {}
  if (input.from) scheduledDate.gte = new Date(input.from)
  if (input.to) scheduledDate.lte = new Date(input.to)
  if (Object.keys(scheduledDate).length > 0) where.scheduledDate = scheduledDate

  return { all: where, done: { ...where, outcome: 'DONE' } }
}
