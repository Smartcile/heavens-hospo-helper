import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, tx, getServerSession, guardAccess, getManagerVenueId } = vi.hoisted(() => {
  const tx = {
    tipsShare: { update: vi.fn(), create: vi.fn() },
  }
  return {
    tx,
    prisma: {
      tipsPeriod: { findUnique: vi.fn(), update: vi.fn() },
      tipsShare: { findMany: vi.fn() },
      staff: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    getManagerVenueId: vi.fn(),
  }
})

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma, Prisma: {}, TipsShareStatus: { PLANNED: 'PLANNED' } }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))

import { PUT } from './route'

const req = (body: unknown) =>
  ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

const period = (shares: unknown[]) => ({
  id: 'p1',
  venueId: 'v1',
  label: 'FEB',
  fromDate: new Date('2026-02-01T00:00:00.000Z'),
  toDate: new Date('2026-02-28T00:00:00.000Z'),
  cashCounts: {},
  posTotal: 0,
  notes: null,
  fullyIssuedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  shares,
})

const share = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  tipsPeriodId: 'p1',
  staffId: 's1',
  name: 'ALEX CHEN',
  hours: 2,
  shareWeight: 1,
  sortOrder: 0,
  status: 'PLANNED',
  approvalNote: null,
  issueNote: null,
  approvedAt: null,
  issuedAt: null,
  deletedAt: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue(null)
  prisma.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
  prisma.tipsPeriod.findUnique.mockImplementation(async (args: { include?: unknown }) =>
    args.include ? period([share()]) : { id: 'p1', venueId: 'v1', deletedAt: null },
  )
  prisma.tipsPeriod.update.mockResolvedValue({})
  prisma.tipsShare.findMany.mockResolvedValue([share()])
  prisma.staff.findMany.mockResolvedValue([{ id: 's1', firstName: 'ALEX', lastName: 'CHEN' }])
  tx.tipsShare.update.mockResolvedValue({})
  tx.tipsShare.create.mockResolvedValue({ id: 'new1' })
})

describe('PUT /api/admin/tips/[id]', () => {
  it('merges rows by id and leaves the share status untouched', async () => {
    const res = await PUT(
      req({
        shares: [
          { id: 'r1', staffId: 's1', name: 'ALEX CHEN', hours: 8, shareWeight: 1, sortOrder: 0 },
          { staffId: null, name: ' walk in ', hours: 2, shareWeight: 0.5, sortOrder: 1 },
        ],
      }),
      { params: { id: 'p1' } },
    )

    expect(res.status).toBe(200)
    expect(tx.tipsShare.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.not.objectContaining({ status: expect.anything() }),
      }),
    )
    expect(tx.tipsShare.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({ hours: 8, deletedAt: null }),
      }),
    )
    expect(tx.tipsShare.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ staffId: null, name: 'WALK IN' }) }),
    )
  })

  it('rejects a staff member outside the period venue', async () => {
    prisma.staff.findMany.mockResolvedValue([])
    const res = await PUT(
      req({ shares: [{ staffId: 'other', name: 'X', hours: 1, shareWeight: 1, sortOrder: 0 }] }),
      { params: { id: 'p1' } },
    )
    expect(res.status).toBe(400)
    expect(tx.tipsShare.update).not.toHaveBeenCalled()
  })

  it('locks the whole period once any share is issued', async () => {
    prisma.tipsPeriod.findUnique.mockImplementation(async (args: { include?: unknown }) =>
      args.include ? period([share({ status: 'ISSUED' })]) : { id: 'p1', venueId: 'v1', deletedAt: null },
    )
    const res = await PUT(req({ shares: [] }), { params: { id: 'p1' } })
    expect(res.status).toBe(409)
    expect(prisma.tipsPeriod.update).not.toHaveBeenCalled()
  })
})
