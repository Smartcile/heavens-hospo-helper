import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    venue: { findUnique: vi.fn() },
    area: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
    openShiftClaim: { findMany: vi.fn() },
    position: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET } from '@/app/api/admin/event-roster/route'

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.venue.findUnique.mockResolvedValue({ lastExternalSyncAt: null })
  prisma.area.findMany.mockResolvedValue([])
  prisma.calendarEvent.findMany.mockResolvedValue([])
  prisma.openShiftClaim.findMany.mockResolvedValue([])
  prisma.position.findMany.mockResolvedValue([])
})

describe('GET /api/admin/event-roster union read', () => {
  it('reads the venue’s rooms plus rooms shared into it', async () => {
    const res = await GET(new NextRequest('http://localhost/api/admin/event-roster?start=2026-11-26&end=2026-11-26'))
    expect(res.status).toBe(200)
    expect(prisma.area.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { venueId: { in: ['v1'] } },
            { venueLinks: { some: { venueId: { in: ['v1'] }, deletedAt: null } } },
          ],
        },
      }),
    )
  })

  it('includes events in a shared room as well as the venue’s own events', async () => {
    const res = await GET(new NextRequest('http://localhost/api/admin/event-roster?start=2026-11-26&end=2026-11-26'))
    expect(res.status).toBe(200)
    const where = prisma.calendarEvent.findMany.mock.calls[0][0].where
    expect(where.AND).toContainEqual({
      OR: [
        { venueId: 'v1' },
        {
          area: {
            deletedAt: null,
            OR: [
              { venueId: { in: ['v1'] } },
              { venueLinks: { some: { venueId: { in: ['v1'] }, deletedAt: null } } },
            ],
          },
        },
      ],
    })
  })
})
