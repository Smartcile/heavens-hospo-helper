import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  prisma,
  applicableChecklistsForStaff,
  resolveOutcomePolicyForChecklists,
} = vi.hoisted(() => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    task: { findMany: vi.fn() },
    taskCompletion: { findMany: vi.fn(), create: vi.fn() },
    taskProgress: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
  applicableChecklistsForStaff: vi.fn(),
  resolveOutcomePolicyForChecklists: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/checklist-applicability.server', () => ({ applicableChecklistsForStaff }))
vi.mock('@/lib/task-outcomes', () => ({ resolveOutcomePolicyForChecklists }))

import { bulkNotRequiredGroup } from '@/lib/task-groups.server'

const TODAY = new Date('2026-11-10T00:00:00.000Z')
const todayDow = TODAY.getUTCDay()

function checklist(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: 'FLOOR OPEN',
    appearFromTime: null,
    activatedOn: null,
    schedules: [],
    events: [],
    allowedOutcomes: ['DONE', 'NOT_REQUIRED'],
    requireOutcomeReason: false,
    multiDay: false,
    tasks: [
      { taskId: 't1', groupLabel: 'OUTSIDE' },
      { taskId: 't2', groupLabel: 'OUTSIDE' },
      { taskId: 't3', groupLabel: 'OUTSIDE' },
      { taskId: 'settled', groupLabel: 'OUTSIDE' },
      { taskId: 'off', groupLabel: 'OUTSIDE' },
      { taskId: 'inside', groupLabel: null },
    ],
    ...overrides,
  }
}

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    scheduleType: 'DAILY',
    scheduleDays: [],
    customCron: null,
    intervalMonths: 1,
    monthlyOption: null,
    monthlyDay: null,
    createdAt: TODAY,
    isOneOff: false,
    dueDate: null,
    rolloverEnabled: false,
    allowedOutcomes: [],
    overrideOutcomes: false,
    requireOutcomeReason: false,
    progress: null,
    ...overrides,
  }
}

const baseInput = {
  staffId: 'st1',
  venueId: 'v1',
  departmentId: 'd1',
  checklistId: 'c1',
  groupLabel: 'outside',
  note: null,
}

describe('bulkNotRequiredGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T09:00:00.000Z'))
    prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
    applicableChecklistsForStaff.mockResolvedValue({
      checklists: [checklist()],
      departmentIds: ['d1'],
    })
    prisma.task.findMany.mockResolvedValue([task('t1'), task('t2'), task('settled'), task('off', {
      scheduleType: 'WEEKLY',
      scheduleDays: [],
    })])
    prisma.taskCompletion.findMany.mockResolvedValue([{ taskId: 'settled' }])
    resolveOutcomePolicyForChecklists.mockImplementation((t: { id: string }) => ({
      allowed: t.id === 't2' ? ['DONE'] : ['DONE', 'NOT_REQUIRED'],
      requireReason: t.id === 't3',
      source: 'LIST',
    }))
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        taskCompletion: { create: vi.fn(async () => ({ id: 'c' })) },
        taskProgress: { deleteMany: vi.fn(async () => ({ count: 0 })) },
      }),
    )
  })

  it('settles eligible group tasks and reports skipped ones', async () => {
    const result = await bulkNotRequiredGroup(baseInput)

    expect(result).toEqual({
      ok: true,
      completed: ['t1'],
      skipped: [
        { taskId: 't2', reason: 'NOT REQUIRED NOT AVAILABLE' },
        { taskId: 'settled', reason: 'ALREADY SETTLED' },
        { taskId: 'off', reason: 'NOT DUE TODAY' },
      ],
      requiresNote: false,
    })
  })

  it('settles every eligible task with one NOT_REQUIRED completion each', async () => {
    prisma.task.findMany.mockResolvedValue([task('t1'), task('t2'), task('t3'), task('settled'), task('off', {
      scheduleType: 'WEEKLY',
      scheduleDays: [],
    })])
    resolveOutcomePolicyForChecklists.mockImplementation((t: { id: string }) => ({
      allowed: t.id === 't2' ? ['DONE'] : ['DONE', 'NOT_REQUIRED'],
      requireReason: false,
      source: 'LIST',
    }))
    const created: { taskId: string; outcome: string; note: string | null; staffId: string }[] = []
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        taskCompletion: {
          create: async (arg: { data: (typeof created)[number] }) => {
            created.push(arg.data)
            return { id: 'c' }
          },
        },
        taskProgress: { deleteMany: async () => ({ count: 0 }) },
      }),
    )

    const result = await bulkNotRequiredGroup({ ...baseInput, note: ' RAIN ' })

    expect(result).toMatchObject({ ok: true, completed: ['t1', 't3'] })
    expect(created.map((c) => c.taskId)).toEqual(['t1', 't3'])
    expect(created.every((c) => c.outcome === 'NOT_REQUIRED' && c.note === 'RAIN' && c.staffId === 'st1')).toBe(true)
  })

  it('refuses the whole action when an eligible task requires a reason', async () => {
    resolveOutcomePolicyForChecklists.mockReturnValue({
      allowed: ['DONE', 'NOT_REQUIRED'],
      requireReason: true,
    })

    const result = await bulkNotRequiredGroup(baseInput)

    expect(result).toMatchObject({ ok: false, status: 422, error: 'A REASON IS REQUIRED' })
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects task ids outside the group', async () => {
    const result = await bulkNotRequiredGroup({ ...baseInput, taskIds: ['inside'] })

    expect(result).toEqual({ ok: false, status: 400, error: 'ONE OR MORE TASKS ARE NOT IN THIS GROUP' })
  })

  it('404s when the label is not on this list', async () => {
    const result = await bulkNotRequiredGroup({ ...baseInput, groupLabel: 'PATIO' })

    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it('404s when the list is not applicable to this worker', async () => {
    applicableChecklistsForStaff.mockResolvedValue({ checklists: [], departmentIds: null })

    const result = await bulkNotRequiredGroup(baseInput)

    expect(result).toMatchObject({ ok: false, status: 404 })
  })

  it('409s when the list is closed today', async () => {
    applicableChecklistsForStaff.mockResolvedValue({
      checklists: [checklist({
        schedules: [{ dayOfWeek: (todayDow + 1) % 7, fromTime: '00:00', toTime: null }],
      })],
      departmentIds: ['d1'],
    })

    const result = await bulkNotRequiredGroup(baseInput)

    expect(result).toMatchObject({ ok: false, status: 409 })
  })
})
