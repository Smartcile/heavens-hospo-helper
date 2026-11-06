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
    taskCompletion: { findFirst: vi.fn(), update: vi.fn() },
    task: { findUnique: vi.fn() },
    taskProgress: { deleteMany: vi.fn() },
    followUp: { updateMany: vi.fn() },
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

import { DELETE, POST } from './route'

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
    prisma.taskCompletion.update.mockResolvedValue({ id: 'c1' })
    prisma.followUp.updateMany.mockResolvedValue({ count: 1 })
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

  it('ignores a retracted completion when checking today', async () => {
    await POST(req({ outcome: 'DONE' }), { params: { id: 't1' } })

    expect(prisma.taskCompletion.findFirst).toHaveBeenCalledWith({
      where: { taskId: 't1', scheduledDate: expect.anything(), deletedAt: null },
    })
  })

  it('DELETE returns 404 when there is no active completion for today', async () => {
    const res = await DELETE({} as NextRequest, { params: { id: 't1' } })

    expect(res.status).toBe(404)
    expect(prisma.taskCompletion.update).not.toHaveBeenCalled()
  })

  it('DELETE soft-deletes the completion, records the undo and resolves the UNTRAINED follow-up', async () => {
    prisma.taskCompletion.findFirst.mockResolvedValue({ id: 'c1', staffId: 'st1', outcome: 'DONE' })
    prisma.task.findUnique.mockResolvedValue({ venueId: 'v1' })

    const res = await DELETE({} as NextRequest, { params: { id: 't1' } })

    expect(res.status).toBe(200)
    expect(prisma.taskCompletion.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        deletedAt: expect.any(Date),
        undoneById: 'st1',
        undoneAt: expect.any(Date),
      }),
    })
    expect(prisma.followUp.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          staffId: 'st1', taskId: 't1', kind: 'UNTRAINED', status: 'OPEN',
        }),
      }),
    )
    expect(reconcileSectionWork).toHaveBeenCalledWith('st1')
  })

  it('DELETE rejects a completion for another venue', async () => {
    prisma.taskCompletion.findFirst.mockResolvedValue({ id: 'c1', staffId: 'st1', outcome: 'DONE' })
    prisma.task.findUnique.mockResolvedValue({ venueId: 'v2' })

    const res = await DELETE({} as NextRequest, { params: { id: 't1' } })

    expect(res.status).toBe(404)
    expect(prisma.taskCompletion.update).not.toHaveBeenCalled()
  })
})
