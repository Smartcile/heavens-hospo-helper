import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    staff: { count: vi.fn(), findMany: vi.fn() },
    staffEvent: { create: vi.fn(), findMany: vi.fn() },
    staffEventInvite: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
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

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/staff-events') => ({ nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

const created = {
  id: 'e1', venueId: 'v1', title: 'TEAM BRIEFING', description: null, location: 'ROOM',
  startsAt: new Date('2026-11-12T18:00:00Z'), endsAt: new Date('2026-11-12T20:00:00Z'),
  allDay: false, attendanceRequired: true, status: 'PUBLISHED',
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    venueId: 'v1',
    title: 'Team briefing',
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
  prisma.staffEvent.create.mockResolvedValue(created)
  prisma.staffEvent.findMany.mockResolvedValue([])
  prisma.staffEventInvite.findMany.mockResolvedValue([])
  prisma.staffEventInvite.updateMany.mockResolvedValue({ count: 0 })
  prisma.staffEventInvite.upsert.mockResolvedValue({})
  prisma.notice.findUnique.mockResolvedValue(null)
  prisma.notice.create.mockResolvedValue({})
  prisma.notice.update.mockResolvedValue({})
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('GET /api/admin/staff-events', () => {
  it('lists events with attendance counts, scoped for a manager', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    prisma.staffEvent.findMany.mockResolvedValue([
      {
        ...created,
        allowMaybe: true, requireDeclineReason: false, responseDeadline: null, notes: null,
        reminderSentAt: null, venueId: 'vm', venue: { id: 'vm', name: 'VENUE' },
        audiences: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }],
        invites: [{ response: 'ACCEPTED' }, { response: 'PENDING' }],
      },
    ])
    const res = await GET(getReq('http://localhost/api/admin/staff-events?venueId=other'))
    const data = await res.json()
    expect(prisma.staffEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ venueId: 'vm' }) }))
    expect(data[0].attendance).toMatchObject({ accepted: 1, pending: 1, total: 2 })
  })
})

describe('POST /api/admin/staff-events', () => {
  it('publishes, materialises invites for the audience plus explicit people, and sends the notice', async () => {
    const res = await POST(postReq(body()))
    expect(res.status).toBe(201)
    expect(prisma.staffEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ venueId: 'v1', status: 'PUBLISHED', audiences: { create: [{ kind: 'DEPARTMENT', targetId: 'kitchen' }] } }),
    }))
    expect(prisma.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.notice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        staffEventId: 'e1',
        priority: 'IMPORTANT',
        pinned: true,
        requiresAck: false,
      }),
    }))
  })

  it('keeps a draft private: invites are stored but no notice is created', async () => {
    prisma.staffEvent.create.mockResolvedValue({ ...created, status: 'DRAFT' })
    const res = await POST(postReq(body({ publish: false })))
    expect(res.status).toBe(201)
    expect(prisma.staffEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT' }) }))
    expect(prisma.staffEventInvite.upsert).toHaveBeenCalledTimes(2)
    expect(prisma.notice.create).not.toHaveBeenCalled()
  })

  it('locks a manager to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'vm' } })
    prisma.staffEvent.create.mockResolvedValue({ ...created, venueId: 'vm' })
    await POST(postReq(body({ venueId: 'other' })))
    expect(prisma.staffEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ venueId: 'vm' }) }))
  })

  it('rejects an explicit invitee who is not active staff at the venue', async () => {
    prisma.staff.count.mockResolvedValue(0)
    const res = await POST(postReq(body()))
    expect(res.status).toBe(400)
    expect(prisma.staffEvent.create).not.toHaveBeenCalled()
  })

  it('rejects invalid times', async () => {
    const res = await POST(postReq(body({ endTime: '' })))
    expect(res.status).toBe(400)
    expect(prisma.staffEvent.create).not.toHaveBeenCalled()
  })
})
