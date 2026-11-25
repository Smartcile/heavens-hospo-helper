import { describe, expect, it } from 'vitest'
import { buildSubtaskSeed, type SubtaskSeedSource } from '@/lib/task-subtask-seed'

const SOURCE: SubtaskSeedSource = {
  venueId: 'v1',
  departmentId: 'd1',
  sectionId: 'sec1',
  completionType: 'TICK_NOTE',
  scheduleType: 'WEEKLY',
  scheduleDays: [1, 2],
  customCron: '',
  intervalMonths: 1,
  monthlyOption: 'FIRST_DAY',
  monthlyDay: 1,
  description: '<p>USE THE GOOD PAPER</p>',
  allowedOutcomes: ['DONE', 'PARTIAL'],
  overrideOutcomes: true,
  requireOutcomeReason: true,
  competencyGuideIds: ['g1'],
  linkedItemId: 'i1',
  checklistIds: ['c1'],
  requiredTrainingIds: [],
}

describe('buildSubtaskSeed', () => {
  it('names the child after the parent and links it', () => {
    const seed = buildSubtaskSeed({ id: 'p1', title: 'NEWSPAPERS' }, SOURCE)

    expect(seed.title).toBe('NEWSPAPERS SUBTASK')
    expect(seed.parentTaskId).toBe('p1')
    expect(seed.assignedToStaffId).toBe('')
  })

  it('copies the wider form fields', () => {
    const seed = buildSubtaskSeed({ id: 'p1', title: 'NEWSPAPERS' }, SOURCE)

    expect(seed.departmentId).toBe('d1')
    expect(seed.sectionId).toBe('sec1')
    expect(seed.completionType).toBe('TICK_NOTE')
    expect(seed.scheduleType).toBe('WEEKLY')
    expect(seed.scheduleDays).toEqual([1, 2])
    expect(seed.description).toBe('<p>USE THE GOOD PAPER</p>')
    expect(seed.linkedItemId).toBe('i1')
    expect(seed.checklistIds).toEqual(['c1'])
  })

  it('copies the outcome policy and competency guides', () => {
    const seed = buildSubtaskSeed({ id: 'p1', title: 'NEWSPAPERS' }, SOURCE)

    expect(seed.allowedOutcomes).toEqual(['DONE', 'PARTIAL'])
    expect(seed.overrideOutcomes).toBe(true)
    expect(seed.requireOutcomeReason).toBe(true)
    expect(seed.competencyGuideIds).toEqual(['g1'])
  })

  it('never copies a legacy required-training selection', () => {
    const seed = buildSubtaskSeed({ id: 'p1', title: 'NEWSPAPERS' }, {
      ...SOURCE,
      // The saved parent may carry legacy TrainingModule links; they must stay
      // on the parent.
      requiredTrainingIds: ['legacy-module'],
    })

    expect(seed.requiredTrainingIds).toEqual([])
  })
})
