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

import { GET, POST } from '@/app/api/admin/calendar-feeds/route'

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

describe('GET /api/admin/calendar-feeds', () => {
  it('counts only live events per room and exposes the dismissed flag', async () => {
    prisma.calendarFeed.findMany.mockResolvedValue([
      {
        id: 'f1',
        areaId: 'a1',
        name: 'ROOM CALENDAR',
        url: 'https://example.com/a.ics',
        source: 'ICAL',
        colour: null,
        floorPlanId: null,
        sortOrder: 0,
        isActive: true,
        lastSyncedAt: null,
        notes: null,
        roomDismissed: false,
        floorPlan: null,
      },
    ])
    prisma.floorPlan.findMany.mockResolvedValue([])
    prisma.area.findMany.mockResolvedValue([
      {
        id: 'a1',
        name: 'FUNCTION ROOM',
        colour: null,
        capacity: 22,
        floorPlanId: null,
        sortOrder: 0,
        notes: null,
        _count: { events: 0 },
      },
    ])

    const res = await GET(new NextRequest('http://localhost/api/admin/calendar-feeds?venueId=v1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.areas[0]).toMatchObject({ id: 'a1', eventCount: 0 })
    expect(body.feeds[0]).toMatchObject({ id: 'f1', roomDismissed: false })
    expect(prisma.area.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { events: { where: { deletedAt: null } } } },
        }),
      }),
    )
  })
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
