import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId } = vi.hoisted(() => ({
  prisma: {
    rosterSlot: { findUnique: vi.fn() },
    staff: { findMany: vi.fn() },
    shift: { createMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)
const params = { params: { id: 'slot1' } }

const slot = (overrides: Record<string, unknown> = {}) => ({
  id: 'slot1',
  venueId: 'v1',
  name: 'DUTY MANAGER',
  positionId: 'p1',
  startTime: '07:00',
  endTime: '16:00',
  breakMinutes: 30,
  headcount: 2,
  colour: '#111111',
  tag: null,
  isActive: true,
  deletedAt: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.rosterSlot.findUnique.mockResolvedValue(slot())
  prisma.staff.findMany.mockResolvedValue([{ id: 's1', departmentId: 'd1' }])
  prisma.shift.createMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/admin/roster/slots/[id]/place', () => {
  it('creates a DRAFT shift for each selected staff member and reports unfilled seats', async () => {
    const res = await POST(req({ date: '2026-11-16', staffIds: ['s1'] }), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.created).toBe(1)
    expect(body.skippedSeats).toBe(1)
    const data = prisma.shift.createMany.mock.calls[0][0].data
    expect(data[0]).toMatchObject({
      staffId: 's1',
      venueId: 'v1',
      departmentId: 'd1',
      positionId: 'p1',
      startTime: '07:00',
      endTime: '16:00',
      breakMinutes: 30,
      status: 'DRAFT',
    })
    expect(data[0].date.toISOString().slice(0, 10)).toBe('2026-11-16')
  })

  it('rejects selecting more staff than the headcount', async () => {
    prisma.staff.findMany.mockResolvedValue([
      { id: 's1', departmentId: null },
      { id: 's2', departmentId: null },
      { id: 's3', departmentId: null },
    ])
    const res = await POST(req({ date: '2026-11-16', staffIds: ['s1', 's2', 's3'] }), params)
    expect(res.status).toBe(422)
    expect(prisma.shift.createMany).not.toHaveBeenCalled()
  })

  it('rejects an inactive slot', async () => {
    prisma.rosterSlot.findUnique.mockResolvedValue(slot({ isActive: false }))
    expect((await POST(req({ date: '2026-11-16', staffIds: ['s1'] }), params)).status).toBe(409)
  })

  it('requires a date', async () => {
    expect((await POST(req({ staffIds: ['s1'] }), params)).status).toBe(400)
  })

  it('requires at least one staff member', async () => {
    expect((await POST(req({ date: '2026-11-16', staffIds: [] }), params)).status).toBe(422)
  })

  it('refuses a cross-venue slot', async () => {
    resolveScopedVenueId.mockReturnValue({ venueId: 'v2' })
    expect((await POST(req({ date: '2026-11-16', staffIds: ['s1'] }), params)).status).toBe(403)
  })
})
