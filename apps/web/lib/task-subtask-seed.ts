// Issue #166 — the child task seeded from the task that was just saved.
// Prisma-free and pure so the "which fields are copied" rule is unit-tested
// without driving the whole task modal.
//
// The post-save seed is wider than the manual "+ ADD SUBTASK" seed: it copies
// the description, outcome policy, competency guides, linked item and lists.
// `requiredTrainingIds` is deliberately NOT copied — POST would re-point the
// parent's legacy TrainingModule link at the new task.

import type { TaskOutcome } from '@/lib/task-outcomes'

/** The saved form fields the child copies. */
export interface SubtaskSeedSource {
  venueId: string
  departmentId: string
  sectionId: string
  completionType: string
  scheduleType: string
  scheduleDays: number[]
  customCron: string
  intervalMonths: number
  monthlyOption: string
  monthlyDay: number
  description: string
  allowedOutcomes: TaskOutcome[]
  overrideOutcomes: boolean
  requireOutcomeReason: boolean
  competencyGuideIds: string[]
  linkedItemId: string
  checklistIds: string[]
  /** Present on the saved form; deliberately ignored (never copied to the child). */
  requiredTrainingIds: string[]
}

export interface SubtaskSeed {
  title: string
  venueId: string
  departmentId: string
  sectionId: string
  completionType: string
  scheduleType: string
  scheduleDays: number[]
  customCron: string
  intervalMonths: number
  monthlyOption: string
  monthlyDay: number
  description: string
  allowedOutcomes: TaskOutcome[]
  overrideOutcomes: boolean
  requireOutcomeReason: boolean
  competencyGuideIds: string[]
  linkedItemId: string
  checklistIds: string[]
  parentTaskId: string
  assignedToStaffId: string
  requiredTrainingIds: string[]
}

export function buildSubtaskSeed(
  parent: { id: string; title: string },
  source: SubtaskSeedSource,
): SubtaskSeed {
  return {
    title: `${parent.title} SUBTASK`,
    venueId: source.venueId,
    departmentId: source.departmentId,
    sectionId: source.sectionId,
    completionType: source.completionType,
    scheduleType: source.scheduleType,
    scheduleDays: [...source.scheduleDays],
    customCron: source.customCron,
    intervalMonths: source.intervalMonths,
    monthlyOption: source.monthlyOption,
    monthlyDay: source.monthlyDay,
    description: source.description,
    allowedOutcomes: [...source.allowedOutcomes],
    overrideOutcomes: source.overrideOutcomes,
    requireOutcomeReason: source.requireOutcomeReason,
    competencyGuideIds: [...source.competencyGuideIds],
    linkedItemId: source.linkedItemId,
    checklistIds: [...source.checklistIds],
    parentTaskId: parent.id,
    assignedToStaffId: '',
    requiredTrainingIds: [],
  }
}
