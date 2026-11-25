import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { prisma, getServerSession, guardAccess, getManagerVenueId } = vi.hoisted(() => ({
  prisma: {
    tipsShare: { findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma, TipsShareStatus: { PLANNED: 'PLANNED', APPROVED: 'APPROVED' } }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))

import { PATCH } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 'p1', shareId: 'r1' } }

const share = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  tipsPeriodId: 'p1',
  status: 'PLANNED',
  tipsPeriod: { venueId: 'v1', deletedAt: null },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue(null)
  prisma.tipsShare.findFirst.mockResolvedValue(share())
  prisma.tipsShare.updateMany.mockResolvedValue({ count: 1 })
  prisma.tipsShare.findUnique.mockResolvedValue({ id: 'r1', status: 'APPROVED' })
})

describe('PATCH /api/admin/tips/[id]/shares/[shareId]', () => {
  it('requires the approve grant', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await PATCH(req({ action: 'APPROVE' }), params)
    expect(res.status).toBe(403)
    expect(prisma.tipsShare.updateMany).not.toHaveBeenCalled()
  })

  it('approves a planned share with a note and stamps the admin', async () => {
    const res = await PATCH(req({ action: 'APPROVE', note: ' CHECKED ' }), params)
    expect(res.status).toBe(200)
    expect(prisma.tipsShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'r1', status: 'PLANNED' }),
        data: expect.objectContaining({ status: 'APPROVED', approvedById: 'u1', approvalNote: 'CHECKED' }),
      }),
    )
  })

  it('404s when the share is not in the period or venue', async () => {
    prisma.tipsShare.findFirst.mockResolvedValue(null)
    const res = await PATCH(req({ action: 'APPROVE' }), params)
    expect(res.status).toBe(404)
  })

  it('409s when the share is not awaiting approval', async () => {
    prisma.tipsShare.findFirst.mockResolvedValue(share({ status: 'APPROVED' }))
    const res = await PATCH(req({ action: 'APPROVE' }), params)
    expect(res.status).toBe(409)
  })

  it('409s when a concurrent request already approved it', async () => {
    prisma.tipsShare.updateMany.mockResolvedValue({ count: 0 })
    const res = await PATCH(req({ action: 'APPROVE' }), params)
    expect(res.status).toBe(409)
  })

  it('rejects an unsupported action', async () => {
    const res = await PATCH(req({ action: 'ISSUE' }), params)
    expect(res.status).toBe(400)
  })
})
