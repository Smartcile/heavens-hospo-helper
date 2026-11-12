import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId, releaseSeatForShift } = vi.hoisted(() => ({
  prisma: {
    rosterTemplate: { findUnique: vi.fn() },
    staff: { findMany: vi.fn() },
    shift: { findMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
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
const params = { params: { id: 't1' } }

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    venueId: 'v1',
    deletedAt: null,
    shifts: [
      { id: 'ts1', staffId: 's1', positionId: 'p1', dayIndex: 0, startTime: '09:00', endTime: '17:00', breakMinutes: 30, colour: '#111111', tag: null, note: null, sortOrder: 0 },
      { id: 'ts2', staffId: 'gone', positionId: null, dayIndex: 6, startTime: '10:00', endTime: '14:00', breakMinutes: 0, colour: null, tag: null, note: null, sortOrder: 1 },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.rosterTemplate.findUnique.mockResolvedValue(template())
  prisma.staff.findMany.mockResolvedValue([{ id: 's1', departmentId: 'd1' }])
  prisma.shift.findMany.mockResolvedValue([])
  prisma.shift.update.mockResolvedValue({})
  prisma.shift.createMany.mockResolvedValue({ count: 1 })
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('POST /api/admin/roster/templates/[id]/apply', () => {
  it('creates DRAFT shifts in ADD mode and reports skipped staff', async () => {
    const res = await POST(req({ venueId: 'v1', weekStart: '2026-11-30', mode: 'ADD' }), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    expect(body.skippedStaffIds).toEqual(['gone'])
    expect(prisma.shift.findMany).not.toHaveBeenCalled()
    const data = prisma.shift.createMany.mock.calls[0][0].data
    expect(data[0]).toMatchObject({
      staffId: 's1',
      venueId: 'v1',
      departmentId: 'd1',
      positionId: 'p1',
      status: 'DRAFT',
      startTime: '09:00',
    })
    expect(data[0].date.toISOString().slice(0, 10)).toBe('2026-11-30')
  })

  it('soft-deletes and releases the target week in REPLACE mode', async () => {
    prisma.shift.findMany.mockResolvedValue([{ id: 'old1' }])
    const res = await POST(req({ venueId: 'v1', weekStart: '2026-11-30', mode: 'REPLACE' }), params)
    expect(res.status).toBe(200)
    expect(prisma.shift.update).toHaveBeenCalledWith({ where: { id: 'old1' }, data: { deletedAt: expect.any(Date) } })
    expect(releaseSeatForShift).toHaveBeenCalledWith('old1', prisma)
  })

  it('422s when no active staff remain', async () => {
    prisma.staff.findMany.mockResolvedValue([])
    const res = await POST(req({ venueId: 'v1', weekStart: '2026-11-30' }), params)
    expect(res.status).toBe(422)
    expect(prisma.shift.createMany).not.toHaveBeenCalled()
  })

  it('refuses a template from another venue', async () => {
    resolveScopedVenueId.mockReturnValue({ venueId: 'v2' })
    expect((await POST(req({ venueId: 'v2', weekStart: '2026-11-30' }), params)).status).toBe(403)
  })

  it('rejects an invalid week start', async () => {
    expect((await POST(req({ venueId: 'v1', weekStart: 'nope' }), params)).status).toBe(400)
  })
})
