import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  taskGuide: { findMany: vi.fn() },
  guideCompletion: { findMany: vi.fn() },
  task: { findUnique: vi.fn() },
  followUp: { upsert: vi.fn() },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: mocks }))

import { checkUntrainedOnCompletion } from '@/lib/followups'

describe('followups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkUntrainedOnCompletion', () => {
    it('returns early when the task declares no competency guide', async () => {
      mocks.taskGuide.findMany.mockResolvedValue([])
      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date(),
      })
      expect(mocks.guideCompletion.findMany).not.toHaveBeenCalled()
    })

    it('returns early when staff holds every required guide', async () => {
      mocks.taskGuide.findMany.mockResolvedValue([
        { guideId: 'g1', guide: { id: 'g1', title: 'FOOD SAFETY' } },
      ])
      mocks.guideCompletion.findMany.mockResolvedValue([{ guideId: 'g1' }])
      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date(),
      })
      expect(mocks.followUp.upsert).not.toHaveBeenCalled()
    })

    // Regression: this path read TaskRequiredTraining/TrainingCompletion, so a
    // competency set in the Playbook (TaskGuide.isRequiredForCompetency) raised
    // no follow-up at all.
    it('creates an UNTRAINED follow-up from a TaskGuide competency', async () => {
      mocks.taskGuide.findMany.mockResolvedValue([
        { guideId: 'g1', guide: { id: 'g1', title: 'FOOD SAFETY' } },
      ])
      mocks.guideCompletion.findMany.mockResolvedValue([])
      mocks.task.findUnique.mockResolvedValue({ title: 'CLEAN KITCHEN' })
      mocks.followUp.upsert.mockResolvedValue({})

      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date('2026-07-05'),
      })

      expect(mocks.followUp.upsert).toHaveBeenCalledTimes(1)
      const call = mocks.followUp.upsert.mock.calls[0][0]
      expect(call.create.kind).toBe('UNTRAINED')
      expect(call.create.detail).toContain('FOOD SAFETY')
      expect(call.create.guideId).toBe('g1')
    })

    it('only flags the guides the staff member is actually missing', async () => {
      mocks.taskGuide.findMany.mockResolvedValue([
        { guideId: 'g1', guide: { id: 'g1', title: 'FOOD SAFETY' } },
        { guideId: 'g2', guide: { id: 'g2', title: 'ALLERGENS' } },
      ])
      mocks.guideCompletion.findMany.mockResolvedValue([{ guideId: 'g1' }])
      mocks.task.findUnique.mockResolvedValue({ title: 'CLEAN KITCHEN' })
      mocks.followUp.upsert.mockResolvedValue({})

      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date('2026-07-05'),
      })

      const call = mocks.followUp.upsert.mock.calls[0][0]
      expect(call.create.detail).toContain('ALLERGENS')
      expect(call.create.detail).not.toContain('FOOD SAFETY')
      expect(call.create.guideId).toBe('g2')
    })

    it('excludes soft-deleted guides from the competency query', async () => {
      mocks.taskGuide.findMany.mockResolvedValue([])
      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date(),
      })
      const where = mocks.taskGuide.findMany.mock.calls[0][0].where
      expect(where.isRequiredForCompetency).toBe(true)
      expect(where.guide).toEqual({ deletedAt: null })
    })
  })
})
