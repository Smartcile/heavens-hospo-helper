import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  prisma,
  getWorkerSession,
  checkUntrainedOnCompletion,
  reconcileSectionWork,
  applicableChecklistsForStaff,
  resolveOutcomePolicyForChecklists,
  isTerminalOutcome,
  outcomeValidationError,
} = vi.hoisted(() => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    taskCompletion: { findFirst: vi.fn() },
    task: { findUnique: vi.fn() },
    taskProgress: { deleteMany: vi.fn() },
    hsAlert: { create: vi.fn() },
    notice: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  getWorkerSession: vi.fn(),
  checkUntrainedOnCompletion: vi.fn(),
  reconcileSectionWork: vi.fn(),
  applicableChecklistsForStaff: vi.fn(),
  resolveOutcomePolicyForChecklists: vi.fn(),
  isTerminalOutcome: vi.fn(),
  outcomeValidationError: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/followups', () => ({ checkUntrainedOnCompletion }))
vi.mock('@/lib/section-work.server', () => ({ reconcileSectionWork }))
vi.mock('@/lib/checklist-applicability.server', () => ({ applicableChecklistsForStaff }))
vi.mock('@/lib/food-safety', () => ({
  readingVerdict: vi.fn(() => 'NA'),
  criticalVerdict: vi.fn(() => false),
  readingAlertMessage: vi.fn(() => ''),
}))
vi.mock('@/lib/task-outcomes', () => ({
  resolveOutcomePolicyForChecklists,
  outcomeValidationError,
  isTerminalOutcome,
}))

import { POST } from './route'

const req = (body: unknown) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
  }) as unknown as NextRequest

describe('POST /api/worker/tasks/[id]/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkerSession.mockResolvedValue({
      staffId: 'st1',
      venueId: 'v1',
      departmentId: 'd1',
      firstName: 'ANN',
    })
    prisma.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
    prisma.taskCompletion.findFirst.mockResolvedValue(null)
    prisma.task.findUnique.mockResolvedValue({
      id: 't1',
      title: 'WIPE BENCHES',
      venueId: 'v1',
      departmentId: 'd1',
      completionType: 'TICK',
      readingUnit: null,
      readingMin: null,
      readingMax: null,
      criticalMin: null,
      criticalMax: null,
      allowedOutcomes: ['DONE'],
      overrideOutcomes: false,
      requireOutcomeReason: false,
    })
    applicableChecklistsForStaff.mockResolvedValue({ checklists: [], departmentIds: null })
    resolveOutcomePolicyForChecklists.mockReturnValue({ allowed: ['DONE'], requireReason: false })
    outcomeValidationError.mockReturnValue(null)
    isTerminalOutcome.mockReturnValue(true)
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        taskCompletion: { create: async () => ({ id: 'c1' }) },
        taskProgress: { deleteMany: async () => ({ count: 0 }) },
      }),
    )
    // Follow-ups never resolve: the completion must still respond.
    checkUntrainedOnCompletion.mockReturnValue(new Promise(() => {}))
    reconcileSectionWork.mockReturnValue(new Promise(() => {}))
  })

  it('returns the completion without waiting for the best-effort follow-ups', async () => {
    const res = await POST(req({ outcome: 'DONE' }), { params: { id: 't1' } })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'c1' })
    expect(checkUntrainedOnCompletion).toHaveBeenCalledTimes(1)
    expect(reconcileSectionWork).toHaveBeenCalledWith('st1')
  })
})
