import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId, releaseSeatForShift } = vi.hoisted(() => ({
  prisma: {
    shift: { findMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    staff: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  releaseSeatForShift: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/open-shifts.server', () => ({ releaseSeatForShift }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

const sourceShift = (overrides: Record<string, unknown> = {}) => ({
  staffId: 's1',
  positionId: 'p1',
  date: new Date('2026-11-09T00:00:00Z'),
  startTime: '09:00',
  endTime: '17:00',
  breakMinutes: 30,
  colour: null,
  tag: null,
  note: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.shift.findMany.mockResolvedValue([sourceShift()])
  prisma.staff.findMany.mockResolvedValue([{ id: 's1', departmentId: 'd1' }])
  prisma.shift.update.mockResolvedValue({})
  prisma.shift.createMany.mockResolvedValue({ count: 1 })
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('POST /api/admin/roster/copy', () => {
  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await POST(req({ venueId: 'v1', sourceStart: '2026-11-09', targetStart: '2026-11-16' }))).status).toBe(401)
  })

  it('copies a week onto the target week in ADD mode', async () => {
    const res = await POST(req({ venueId: 'v1', sourceStart: '2026-11-09', targetStart: '2026-11-16', mode: 'ADD' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    const data = prisma.shift.createMany.mock.calls[0][0].data
    expect(data[0].date.toISOString().slice(0, 10)).toBe('2026-11-16')
    expect(data[0].status).toBe('DRAFT')
  })

  it('clears the target week in REPLACE mode', async () => {
    prisma.shift.findMany
      .mockResolvedValueOnce([sourceShift()])
      .mockResolvedValueOnce([{ id: 'old-target' }])
    const res = await POST(req({ venueId: 'v1', sourceStart: '2026-11-09', targetStart: '2026-11-16', mode: 'REPLACE' }))
    expect(res.status).toBe(200)
    expect(prisma.shift.update).toHaveBeenCalledWith({ where: { id: 'old-target' }, data: { deletedAt: expect.any(Date) } })
    expect(releaseSeatForShift).toHaveBeenCalledWith('old-target', prisma)
  })

  it('skips staff who are no longer active', async () => {
    prisma.staff.findMany.mockResolvedValue([])
    const res = await POST(req({ venueId: 'v1', sourceStart: '2026-11-09', targetStart: '2026-11-16' }))
    expect(res.status).toBe(422)
  })

  it('rejects copying a week onto itself', async () => {
    expect((await POST(req({ venueId: 'v1', sourceStart: '2026-11-09', targetStart: '2026-11-11' }))).status).toBe(400)
  })

  it('rejects an invalid date', async () => {
    expect((await POST(req({ venueId: 'v1', sourceStart: 'nope', targetStart: '2026-11-16' }))).status).toBe(400)
  })
})
