import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId } = vi.hoisted(() => ({
  prisma: {
    rosterSlot: { findUnique: vi.fn(), update: vi.fn() },
    position: { findFirst: vi.fn() },
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

import { DELETE, PUT } from './route'

const req = (body: unknown = {}) => ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)
const params = { params: { id: 'slot1' } }

const existing = {
  id: 'slot1', venueId: 'v1', name: 'DM', positionId: 'p1', startTime: '07:00', endTime: '16:00',
  breakMinutes: 0, headcount: 1, colour: null, tag: null, isActive: true, sortOrder: 3, deletedAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.rosterSlot.findUnique.mockResolvedValue(existing)
  prisma.rosterSlot.update.mockResolvedValue({ ...existing, name: 'BAR' })
  prisma.position.findFirst.mockResolvedValue({ id: 'p1' })
})

const validBody = { name: 'BAR', positionId: 'p1', startTime: '09:00', endTime: '17:00', breakMinutes: 15, headcount: 2 }

describe('PUT /api/admin/roster/slots/[id]', () => {
  it('updates a slot', async () => {
    const res = await PUT(req(validBody), params)
    expect(res.status).toBe(200)
    expect(prisma.rosterSlot.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot1' },
      data: expect.objectContaining({ name: 'BAR', headcount: 2 }),
    }))
  })

  it('404s an unknown slot', async () => {
    prisma.rosterSlot.findUnique.mockResolvedValue(null)
    expect((await PUT(req(validBody), params)).status).toBe(404)
  })

  it('refuses a cross-venue slot', async () => {
    resolveScopedVenueId.mockReturnValue({ venueId: 'v2' })
    expect((await PUT(req(validBody), params)).status).toBe(403)
  })

  it('rejects invalid input', async () => {
    expect((await PUT(req({ ...validBody, headcount: 99 }), params)).status).toBe(400)
  })
})

describe('DELETE /api/admin/roster/slots/[id]', () => {
  it('soft-deletes the slot', async () => {
    const res = await DELETE(req(), params)
    expect(res.status).toBe(200)
    expect(prisma.rosterSlot.update).toHaveBeenCalledWith({ where: { id: 'slot1' }, data: { deletedAt: expect.any(Date) } })
  })

  it('404s an unknown slot', async () => {
    prisma.rosterSlot.findUnique.mockResolvedValue(null)
    expect((await DELETE(req(), params)).status).toBe(404)
  })
})
