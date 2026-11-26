import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    area: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    areaVenue: { create: vi.fn() },
    floorPlan: { findMany: vi.fn(), findFirst: vi.fn() },
    calendarFeed: { findMany: vi.fn(), create: vi.fn() },
    venue: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET, POST } from '@/app/api/admin/areas/route'

const session = {
  user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue(session)
  prisma.area.findMany.mockResolvedValue([])
  prisma.floorPlan.findMany.mockResolvedValue([])
  prisma.calendarFeed.findMany.mockResolvedValue([])
  prisma.venue.findMany.mockResolvedValue([{ id: 'v1', name: 'VENUE' }])
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('GET /api/admin/areas', () => {
  it('reads the owner rooms plus rooms shared into the active venue', async () => {
    const res = await GET(new NextRequest('http://localhost/api/admin/areas?venueId=v1'))
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

  it('exposes owner/shared metadata for the room list', async () => {
    prisma.area.findMany.mockResolvedValue([
      {
        id: 'a1',
        venueId: 'v1',
        name: 'OWN ROOM',
        colour: null,
        capacity: 10,
        floorPlanId: null,
        sortOrder: 0,
        notes: null,
        floorPlan: null,
        venue: { id: 'v1', name: 'VENUE' },
        venueLinks: [
          { venueId: 'v1', isOwner: true, venue: { id: 'v1', name: 'VENUE' } },
          { venueId: 'v2', isOwner: false, venue: { id: 'v2', name: 'OTHER' } },
        ],
        feeds: [],
      },
    ])
    const res = await GET(new NextRequest('http://localhost/api/admin/areas?venueId=v1'))
    const body = await res.json()
    expect(body.areas[0]).toMatchObject({ id: 'a1', isOwner: true })
    expect(body.areas[0].sharedWith).toEqual([{ venueId: 'v2', name: 'OTHER' }])
  })
})

describe('POST /api/admin/areas', () => {
  it('creates the owner AreaVenue link so the union read is uniform', async () => {
    prisma.area.findFirst.mockResolvedValue({ sortOrder: -1 })
    prisma.area.create.mockResolvedValue({ id: 'a1' })
    const req = new NextRequest('http://localhost/api/admin/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'NEW ROOM' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prisma.areaVenue.create).toHaveBeenCalledWith({
      data: { areaId: 'a1', venueId: 'v1', isOwner: true },
    })
  })
})
