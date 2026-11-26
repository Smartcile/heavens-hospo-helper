import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    calendarFeed: { findFirst: vi.fn(), update: vi.fn() },
    area: { findFirst: vi.fn() },
    floorPlan: { findFirst: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { PUT } from '@/app/api/admin/calendar-feeds/[id]/route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/calendar-feeds/f1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: { id: 'f1' } }

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.calendarFeed.findFirst.mockResolvedValue({
    id: 'f1',
    venueId: 'v1',
    name: 'TE KAWAU ROOM',
    areaId: 'a1',
  })
  prisma.area.findFirst.mockResolvedValue({ id: 'a1' })
  prisma.calendarFeed.update.mockImplementation(async ({ data }: { data: unknown }) => data)
})

describe('PUT /api/admin/calendar-feeds/[id]', () => {
  it('marks the feed dismissed when the room is cleared', async () => {
    const res = await PUT(request({ areaId: null }), params)
    expect(res!.status).toBe(200)
    expect(prisma.calendarFeed.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: expect.objectContaining({ areaId: null, roomDismissed: true }),
    })
  })

  it('assigning a room clears the dismissed flag', async () => {
    const res = await PUT(request({ areaId: 'a1' }), params)
    expect(res!.status).toBe(200)
    expect(prisma.calendarFeed.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: expect.objectContaining({ areaId: 'a1', roomDismissed: false }),
    })
  })

  it('leaves the room untouched when areaId is omitted', async () => {
    const res = await PUT(request({ name: 'RENAMED ROOM' }), params)
    expect(res!.status).toBe(200)
    const data = prisma.calendarFeed.update.mock.calls[0][0].data
    expect(data).not.toHaveProperty('areaId')
    expect(data).not.toHaveProperty('roomDismissed')
  })
})
