import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  taskGuide: { findMany: vi.fn() },
  guideCompletion: { findMany: vi.fn() },
  task: { findUnique: vi.fn(), findMany: vi.fn() },
  followUp: { upsert: vi.fn() },
  venue: { findFirst: vi.fn() },
  taskCompletion: { findMany: vi.fn() },
  taskProgress: { findMany: vi.fn() },
  checklistTask: { findMany: vi.fn() },
  guideAssignment: { upsert: vi.fn() },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: mocks }))

// Freeze "today" so the 7-day missed window is deterministic.
vi.mock('@/lib/utils', () => ({
  getTodayDate: () => new Date('2026-11-08T00:00:00.000Z'),
}))

import { checkUntrainedOnCompletion, generateVenueFollowUps } from '@/lib/followups'
import { formatDateKey } from '@/lib/scheduling'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

function dailyTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    title: 'CLEAN KITCHEN',
    assignedToStaffId: 's1',
    scheduleType: 'DAILY',
    scheduleDays: [],
    customCron: null,
    intervalMonths: 1,
    monthlyOption: null,
    monthlyDay: null,
    createdAt: day('2026-10-01'),
    taskGuides: [{ guideId: 'g1' }],
    ...overrides,
  }
}

function missedDueDates(): string[] {
  return mocks.followUp.upsert.mock.calls.map((call) =>
    formatDateKey(call[0].create.dueDate as Date),
  )
}

describe('followups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.venue.findFirst.mockResolvedValue({ id: 'v1', timezone: 'Pacific/Auckland' })
    mocks.task.findMany.mockResolvedValue([dailyTask()])
    mocks.taskCompletion.findMany.mockResolvedValue([])
    mocks.taskProgress.findMany.mockResolvedValue([])
    mocks.checklistTask.findMany.mockResolvedValue([])
    mocks.guideAssignment.upsert.mockResolvedValue({})
    mocks.followUp.upsert.mockResolvedValue({
      createdAt: new Date(1000),
      updatedAt: new Date(1000),
    })
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

  describe('generateVenueFollowUps — day-aware progress', () => {
    // The reported bug: a PARTIAL left on a daily list yesterday must not hide
    // the missed follow-up for that day.
    it('raises MISSED for past days when yesterday\'s partial is stale', async () => {
      mocks.taskProgress.findMany.mockResolvedValue([
        { taskId: 't1', progressDate: day('2026-11-07') },
      ])

      const created = await generateVenueFollowUps('v1')

      // 7 past days; only 2026-11-07 is covered by the live partial.
      expect(created).toBe(6)
      expect(mocks.followUp.upsert).toHaveBeenCalledTimes(6)
      expect(missedDueDates()).not.toContain('2026-11-07')
    })

    it('suppresses MISSED on the day a partial was reported', async () => {
      mocks.taskProgress.findMany.mockResolvedValue([
        { taskId: 't1', progressDate: day('2026-11-05') },
      ])

      await generateVenueFollowUps('v1')

      expect(mocks.followUp.upsert).toHaveBeenCalledTimes(6)
      expect(missedDueDates()).not.toContain('2026-11-05')
    })

    it('keeps a multi-day partial live, so no MISSED is raised', async () => {
      mocks.taskProgress.findMany.mockResolvedValue([
        { taskId: 't1', progressDate: day('2026-11-07') },
      ])
      mocks.checklistTask.findMany.mockResolvedValue([{ taskId: 't1' }])

      const created = await generateVenueFollowUps('v1')

      expect(created).toBe(0)
      expect(mocks.followUp.upsert).not.toHaveBeenCalled()
    })

    it('treats a legacy null progressDate as stale', async () => {
      mocks.taskProgress.findMany.mockResolvedValue([
        { taskId: 't1', progressDate: null },
      ])

      const created = await generateVenueFollowUps('v1')

      expect(created).toBe(7)
    })
  })
})
