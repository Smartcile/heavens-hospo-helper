import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    staffEvent: { findFirst: vi.fn(), update: vi.fn() },
    staffEventInvite: { updateMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { POST } from './route'

const params = { params: { id: 'e1' } }
const req = {} as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.staffEvent.findFirst.mockResolvedValue({ id: 'e1', venueId: 'v1', status: 'PUBLISHED' })
  prisma.staffEventInvite.updateMany.mockResolvedValue({ count: 3 })
  prisma.staffEvent.update.mockResolvedValue({})
})

describe('POST /api/admin/staff-events/[id]/remind', () => {
  it('stamps every pending invite and the event', async () => {
    const res = await POST(req, params)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.reminded).toBe(3)
    expect(prisma.staffEventInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { staffEventId: 'e1', deletedAt: null, response: 'PENDING' },
      data: { reminderSentAt: expect.any(Date) },
    }))
    expect(prisma.staffEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'e1' },
      data: { reminderSentAt: expect.any(Date) },
    }))
  })

  it('refuses to remind on a draft event', async () => {
    prisma.staffEvent.findFirst.mockResolvedValueOnce({ id: 'e1', venueId: 'v1', status: 'DRAFT' })
    const res = await POST(req, params)
    expect(res.status).toBe(409)
    expect(prisma.staffEventInvite.updateMany).not.toHaveBeenCalled()
  })

  it('blocks a manager from another venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    const res = await POST(req, params)
    expect(res.status).toBe(403)
  })
})
