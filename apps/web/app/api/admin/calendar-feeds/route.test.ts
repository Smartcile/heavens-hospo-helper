import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    calendarFeed: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    area: { findFirst: vi.fn(), findMany: vi.fn() },
    floorPlan: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { POST } from '@/app/api/admin/calendar-feeds/route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/calendar-feeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.calendarFeed.findFirst.mockResolvedValue(null)
  prisma.area.findFirst.mockResolvedValue({ id: 'a1' })
  prisma.calendarFeed.create.mockImplementation(async ({ data }: { data: unknown }) => data)
  prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops))
})

describe('POST /api/admin/calendar-feeds', () => {
  it('rejects a feed with no explicit room choice', async () => {
    const res = await POST(request({ venueId: 'v1', name: 'TE KAWAU ROOM', url: 'https://example.com/a.ics' }))
    expect(res.status).toBe(400)
    expect(prisma.calendarFeed.create).not.toHaveBeenCalled()
  })

  it('links a feed to the chosen room', async () => {
    const res = await POST(
      request({ venueId: 'v1', name: 'TE KAWAU ROOM', url: 'https://example.com/a.ics', areaId: 'a1' }),
    )
    expect(res.status).toBe(201)
    expect(prisma.calendarFeed.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ areaId: 'a1', roomDismissed: false }),
    })
  })

  it('accepts an explicit UNASSIGNED choice and marks the feed dismissed', async () => {
    const res = await POST(
      request({ venueId: 'v1', name: 'TE KAWAU ROOM', url: 'https://example.com/a.ics', areaId: null }),
    )
    expect(res.status).toBe(201)
    expect(prisma.calendarFeed.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ areaId: null, roomDismissed: true }),
    })
  })
})
