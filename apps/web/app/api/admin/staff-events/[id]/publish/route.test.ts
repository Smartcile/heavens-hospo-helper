import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    staff: { findMany: vi.fn() },
    staffEvent: { findFirst: vi.fn(), update: vi.fn() },
    staffEventInvite: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    notice: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
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

const draft = {
  id: 'e1', venueId: 'v1', status: 'DRAFT', title: 'TEAM BRIEFING',
  audiences: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }],
}
const published = {
  id: 'e1', venueId: 'v1', title: 'TEAM BRIEFING', description: null, location: 'ROOM',
  startsAt: new Date('2026-11-12T18:00:00Z'), endsAt: new Date('2026-11-12T20:00:00Z'),
  allDay: false, attendanceRequired: true, status: 'PUBLISHED',
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.staffEvent.findFirst.mockResolvedValue(draft)
  prisma.staffEvent.update.mockResolvedValue(published)
  prisma.staffEventInvite.count.mockResolvedValue(0)
  prisma.staffEventInvite.findMany.mockResolvedValue([])
  prisma.staffEventInvite.updateMany.mockResolvedValue({ count: 0 })
  prisma.staffEventInvite.upsert.mockResolvedValue({})
  prisma.staff.findMany.mockResolvedValue([{ id: 'a', departmentId: 'kitchen', sections: [], positions: [] }])
  prisma.notice.findUnique.mockResolvedValue(null)
  prisma.notice.create.mockResolvedValue({})
  prisma.notice.update.mockResolvedValue({})
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('POST /api/admin/staff-events/[id]/publish', () => {
  it('publishes, materialises the known audience and sends the linked notice', async () => {
    const res = await POST(req, params)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.invited).toBe(1)
    expect(prisma.staffEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'PUBLISHED' } }))
    expect(prisma.staffEventInvite.upsert).toHaveBeenCalledTimes(1)
    expect(prisma.notice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ staffEventId: 'e1', requiresAck: false, priority: 'IMPORTANT' }),
    }))
  })

  it('refuses to publish an audience-less event with no invites', async () => {
    prisma.staffEvent.findFirst.mockResolvedValue({ ...draft, audiences: [] })
    prisma.staffEventInvite.count.mockResolvedValue(0)
    const res = await POST(req, params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'SET WHO IS INVITED BEFORE PUBLISHING' })
    expect(prisma.staffEvent.update).not.toHaveBeenCalled()
  })

  it('publishes a whole-venue draft that already has invites', async () => {
    prisma.staffEvent.findFirst.mockResolvedValue({ ...draft, audiences: [] })
    prisma.staffEventInvite.count.mockResolvedValue(2)
    prisma.staff.findMany.mockResolvedValue([
      { id: 'a', departmentId: 'kitchen', sections: [], positions: [] },
      { id: 'b', departmentId: 'bar', sections: [], positions: [] },
    ])
    prisma.staffEventInvite.findMany.mockResolvedValue([
      { staffId: 'a', response: 'ACCEPTED' },
      { staffId: 'b', response: 'PENDING' },
    ])
    const res = await POST(req, params)
    expect(res.status).toBe(200)
    expect(prisma.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
  })

  it('blocks a manager from another venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    const res = await POST(req, params)
    expect(res.status).toBe(403)
  })
})
