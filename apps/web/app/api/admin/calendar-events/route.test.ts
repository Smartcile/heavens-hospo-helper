import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    calendarEvent: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET } from '@/app/api/admin/calendar-events/route'

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.calendarEvent.findMany.mockResolvedValue([])
})

describe('GET /api/admin/calendar-events union read', () => {
  it('lists the venue’s events and events in rooms shared into it', async () => {
    const res = await GET(new NextRequest('http://localhost/api/admin/calendar-events'))
    expect(res.status).toBe(200)
    expect(prisma.calendarEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { venueId: 'v1' },
            { area: { venueLinks: { some: { venueId: 'v1', deletedAt: null } } } },
          ],
        },
      }),
    )
  })
})
