import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  taskRequiredTraining: { findMany: vi.fn() },
  trainingCompletion: { findMany: vi.fn() },
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
    it('returns early when no required training exists', async () => {
      mocks.taskRequiredTraining.findMany.mockResolvedValue([])
      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date(),
      })
      expect(mocks.trainingCompletion.findMany).not.toHaveBeenCalled()
    })

    it('returns early when staff holds all required training', async () => {
      mocks.taskRequiredTraining.findMany.mockResolvedValue([
        { moduleId: 'm1', module: { id: 'm1', title: 'FOOD SAFETY' } },
      ])
      mocks.trainingCompletion.findMany.mockResolvedValue([{ moduleId: 'm1' }])
      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date(),
      })
      expect(mocks.followUp.upsert).not.toHaveBeenCalled()
    })

    it('creates UNTRAINED follow-up when training is missing', async () => {
      mocks.taskRequiredTraining.findMany.mockResolvedValue([
        { moduleId: 'm1', module: { id: 'm1', title: 'FOOD SAFETY' } },
      ])
      mocks.trainingCompletion.findMany.mockResolvedValue([])
      mocks.task.findUnique.mockResolvedValue({ title: 'CLEAN KITCHEN' })
      mocks.followUp.upsert.mockResolvedValue({})

      await checkUntrainedOnCompletion({
        taskId: 't1', staffId: 's1', venueId: 'v1', date: new Date('2026-07-05'),
      })

      expect(mocks.followUp.upsert).toHaveBeenCalledTimes(1)
      const call = mocks.followUp.upsert.mock.calls[0][0]
      expect(call.create.kind).toBe('UNTRAINED')
      expect(call.create.detail).toContain('FOOD SAFETY')
    })
  })
})
