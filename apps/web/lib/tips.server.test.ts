import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    tipsShare: { count: vi.fn(), updateMany: vi.fn() },
    tipsPeriod: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@hospo-ops/db', () => ({
  prisma,
  TipsShareStatus: { ISSUED: 'ISSUED', FULLY_ISSUED: 'FULLY_ISSUED' },
}))

import { buildTipsPeriodPayload, maybeFullyIssuePeriod } from './tips.server'

beforeEach(() => {
  vi.clearAllMocks()
  prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops))
  prisma.tipsShare.updateMany.mockResolvedValue({ count: 2 })
  prisma.tipsPeriod.updateMany.mockResolvedValue({ count: 1 })
})

describe('maybeFullyIssuePeriod', () => {
  it('auto-finalises only when every live share is issued', async () => {
    prisma.tipsShare.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(2)

    await expect(maybeFullyIssuePeriod('p1')).resolves.toBe(true)
    expect(prisma.tipsShare.updateMany).toHaveBeenCalledWith({
      where: { tipsPeriodId: 'p1', deletedAt: null, status: 'ISSUED' },
      data: { status: 'FULLY_ISSUED' },
    })
    expect(prisma.tipsPeriod.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', fullyIssuedAt: null },
      data: { fullyIssuedAt: expect.any(Date) },
    })
  })

  it('does nothing while a share is still outstanding', async () => {
    prisma.tipsShare.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    await expect(maybeFullyIssuePeriod('p1')).resolves.toBe(false)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('does nothing for a period with no shares', async () => {
    prisma.tipsShare.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    await expect(maybeFullyIssuePeriod('p1')).resolves.toBe(false)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('buildTipsPeriodPayload', () => {
  it('derives cash-rounded amounts and progress from the live rows', () => {
    const payload = buildTipsPeriodPayload({
      id: 'p1',
      venueId: 'v1',
      label: 'FEB',
      fromDate: new Date('2026-02-01T00:00:00.000Z'),
      toDate: new Date('2026-02-28T00:00:00.000Z'),
      cashCounts: { '0.2': 0 },
      posTotal: 100,
      notes: null,
      fullyIssuedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      shares: [
        {
          id: 'r1',
          staffId: 's1',
          name: 'A',
          hours: 1,
          shareWeight: 1,
          sortOrder: 0,
          status: 'APPROVED',
          approvalNote: null,
          issueNote: null,
          approvedAt: null,
          issuedAt: null,
          deletedAt: null,
        },
        {
          id: 'r2',
          staffId: null,
          name: 'B',
          hours: 1,
          shareWeight: 1,
          sortOrder: 1,
          status: 'PLANNED',
          approvalNote: null,
          issueNote: null,
          approvedAt: null,
          issuedAt: null,
          deletedAt: null,
        },
        {
          id: 'r3',
          staffId: null,
          name: 'DELETED',
          hours: 1,
          shareWeight: 1,
          sortOrder: 2,
          status: 'PLANNED',
          approvalNote: null,
          issueNote: null,
          approvedAt: null,
          issuedAt: null,
          deletedAt: new Date(),
        },
      ],
    })

    expect(payload.poolTotal).toBe(100)
    expect(payload.shares).toHaveLength(2)
    expect(payload.shares[0].amount).toBe(50)
    expect(payload.progress).toMatchObject({ total: 2, approved: 1, planned: 1 })
  })
})
