import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getWorkerSession, maybeFullyIssuePeriod } = vi.hoisted(() => ({
  prisma: {
    tipsShare: { findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
  getWorkerSession: vi.fn(),
  maybeFullyIssuePeriod: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  prisma,
  TipsShareStatus: { APPROVED: 'APPROVED', ISSUED: 'ISSUED' },
}))
vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@/lib/tips.server', () => ({ maybeFullyIssuePeriod }))

import { POST } from './route'

const req = (body: unknown = {}) => ({ json: async () => body } as unknown as NextRequest)
const params = { params: { shareId: 'r1' } }

const share = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  status: 'APPROVED',
  tipsPeriod: { id: 'p1', venueId: 'v1', deletedAt: null },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'MANAGER' })
  prisma.tipsShare.findFirst.mockResolvedValue(share())
  prisma.tipsShare.updateMany.mockResolvedValue({ count: 1 })
  prisma.tipsShare.findUnique.mockResolvedValue({ id: 'r1', status: 'ISSUED', issueNote: 'CASH' })
  maybeFullyIssuePeriod.mockResolvedValue(false)
})

describe('POST /api/worker/tips/[shareId]/issue', () => {
  it('refuses floor staff', async () => {
    getWorkerSession.mockResolvedValue({ staffId: 's1', venueId: 'v1', role: 'STAFF' })
    const res = await POST(req(), params)
    expect(res.status).toBe(403)
    expect(prisma.tipsShare.updateMany).not.toHaveBeenCalled()
  })

  it('404s for a share outside the worker venue', async () => {
    prisma.tipsShare.findFirst.mockResolvedValue(share({ tipsPeriod: { id: 'p1', venueId: 'v2', deletedAt: null } }))
    const res = await POST(req(), params)
    expect(res.status).toBe(404)
  })

  it('only issues an APPROVED share, saving the optional note', async () => {
    const res = await POST(req({ note: ' CASH ' }), params)
    expect(res.status).toBe(200)
    expect(prisma.tipsShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'r1', status: 'APPROVED' }),
        data: expect.objectContaining({ status: 'ISSUED', issuedById: 's1', issueNote: 'CASH' }),
      }),
    )
    expect(maybeFullyIssuePeriod).toHaveBeenCalledWith('p1')
    expect(await res.json()).toMatchObject({ fullyIssued: false })
  })

  it('409s a share that is not approved', async () => {
    prisma.tipsShare.findFirst.mockResolvedValue(share({ status: 'PLANNED' }))
    const res = await POST(req(), params)
    expect(res.status).toBe(409)
    expect(prisma.tipsShare.updateMany).not.toHaveBeenCalled()
  })

  it('409s a concurrent double-issue', async () => {
    prisma.tipsShare.updateMany.mockResolvedValue({ count: 0 })
    const res = await POST(req(), params)
    expect(res.status).toBe(409)
  })
})
