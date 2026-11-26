import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    area: { findFirst: vi.fn() },
    service: { findFirst: vi.fn() },
    floorPlanSetup: { findFirst: vi.fn() },
    booking: { create: vi.fn() },
    calendarEvent: { update: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { POST } from '@/app/api/admin/bookings/route'

function holdRequest(areaId: string | null): NextRequest {
  return new NextRequest('http://localhost/api/admin/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hold: true,
      date: '2026-11-26',
      startTime: '18:00',
      endTime: '20:00',
      partySize: 6,
      contactName: 'JONES',
      areaId,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.area.findFirst.mockResolvedValue({ id: 'a1' })
  prisma.booking.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'b1', ...(data as object) }))
})

describe('POST /api/admin/bookings — room hold (#189)', () => {
  it('creates a room hold without a service and stamps the room', async () => {
    const res = await POST(holdRequest('a1'))
    expect(res.status).toBe(201)
    expect(prisma.booking.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ areaId: 'a1', contactName: 'JONES' }),
      include: { tables: true },
    })
  })

  it('rejects a room the venue does not own or share', async () => {
    prisma.area.findFirst.mockResolvedValue(null)
    const res = await POST(holdRequest('other-venue-room'))
    expect(res.status).toBe(400)
    expect(prisma.booking.create).not.toHaveBeenCalled()
  })
})
