import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    staff: { count: vi.fn(), findMany: vi.fn() },
    staffEvent: { findFirst: vi.fn(), update: vi.fn() },
    staffEventInvite: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    notice: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { DELETE, PUT } from './route'

const params = { params: { id: 'e1' } }
const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

const existing = {
  id: 'e1', venueId: 'v1', status: 'DRAFT', title: 'TEAM BRIEFING',
  audiences: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }],
}

const updated = {
  id: 'e1', venueId: 'v1', title: 'TEAM BRIEFING', description: null, location: 'ROOM',
  startsAt: new Date('2026-11-12T18:00:00Z'), endsAt: new Date('2026-11-12T20:00:00Z'),
  allDay: false, attendanceRequired: true, status: 'DRAFT',
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    title: 'TEAM BRIEFING',
    date: '2026-11-12',
    startTime: '18:00',
    endTime: '20:00',
    attendanceRequired: true,
    allowMaybe: true,
    audiences: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }],
    staffIds: ['b'],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  prisma.staff.count.mockResolvedValue(1)
  prisma.staff.findMany.mockResolvedValue([
    { id: 'a', departmentId: 'kitchen', sections: [], positions: [] },
    { id: 'b', departmentId: 'bar', sections: [], positions: [] },
  ])
  prisma.staffEvent.findFirst.mockResolvedValue(existing)
  prisma.staffEvent.update.mockResolvedValue(updated)
  prisma.staffEventInvite.findMany.mockResolvedValue([])
  prisma.staffEventInvite.updateMany.mockResolvedValue({ count: 0 })
  prisma.staffEventInvite.upsert.mockResolvedValue({})
  prisma.notice.findUnique.mockResolvedValue(null)
  prisma.notice.create.mockResolvedValue({})
  prisma.notice.update.mockResolvedValue({})
  prisma.notice.updateMany.mockResolvedValue({ count: 1 })
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('PUT /api/admin/staff-events/[id]', () => {
  it('re-materialises invites on a DRAFT but sends no notice', async () => {
    const res = await PUT(req(body()), params)
    expect(res.status).toBe(200)
    // Audience KITCHEN reaches a; specific person b is added.
    expect(prisma.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.notice.create).not.toHaveBeenCalled()
    expect(prisma.notice.update).not.toHaveBeenCalled()
  })

  it('updates the notice for a PUBLISHED event', async () => {
    prisma.staffEvent.findFirst.mockResolvedValue({ ...existing, status: 'PUBLISHED' })
    prisma.staffEvent.update.mockResolvedValue({ ...updated, status: 'PUBLISHED' })
    await PUT(req(body()), params)
    expect(prisma.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.notice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ staffEventId: 'e1', requiresAck: false }),
    }))
  })

  it('retains responded invitees but retires pending people when explicit is cleared', async () => {
    prisma.staffEventInvite.findMany.mockResolvedValue([
      { staffId: 'a', response: 'ACCEPTED' },
      { staffId: 'b', response: 'PENDING' },
    ])
    const res = await PUT(req(body({ audiences: [{ kind: 'SECTION', targetId: 'nowhere' }], staffIds: [] })), params)
    expect(res.status).toBe(200)
    // Nobody matches the new audience and explicit is an intentional [].
    expect(prisma.staffEventInvite.upsert).not.toHaveBeenCalled()
    expect(prisma.staffEventInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ response: 'PENDING', staffId: { notIn: ['__none__'] } }),
    }))
  })

  it('falls back to the whole venue when every specific person is cleared on an audience-less event', async () => {
    prisma.staffEvent.findFirst.mockResolvedValue({ ...existing, audiences: [] })
    prisma.staffEvent.update.mockResolvedValue({ ...updated, status: 'DRAFT' })
    await PUT(req(body({ audiences: [], staffIds: [] })), params)
    expect(prisma.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
  })

  it('rejects an invitee who is not active staff at the venue', async () => {
    prisma.staff.count.mockResolvedValue(0)
    const res = await PUT(req(body()), params)
    expect(res.status).toBe(400)
    expect(prisma.staffEvent.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/staff-events/[id]', () => {
  it('soft-deletes the event, its notice and its invites', async () => {
    const res = await DELETE({} as NextRequest, params)
    expect(res.status).toBe(200)
    expect(prisma.staffEvent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'e1' },
      data: expect.objectContaining({ deletedAt: expect.any(Date), status: 'CANCELLED' }),
    }))
    expect(prisma.notice.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { staffEventId: 'e1', deletedAt: null },
      data: expect.objectContaining({ deletedAt: expect.any(Date), isActive: false }),
    }))
    expect(prisma.staffEventInvite.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { staffEventId: 'e1', deletedAt: null },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    }))
  })

  it('blocks a manager from another venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    const res = await DELETE({} as NextRequest, params)
    expect(res.status).toBe(403)
  })
})
