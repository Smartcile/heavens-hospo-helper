import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    area: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    calendarFeed: { updateMany: vi.fn() },
    calendarEvent: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET, POST } from '@/app/api/admin/areas/cleanup/route'

function getRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/areas/cleanup?venueId=v1')
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/areas/cleanup', {
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
  prisma.calendarFeed.updateMany.mockResolvedValue({ count: 1 })
  prisma.calendarEvent.updateMany.mockResolvedValue({ count: 2 })
  prisma.area.update.mockResolvedValue({ id: 'j1' })
  prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops))
})

describe('GET /api/admin/areas/cleanup', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await GET(getRequest())
    expect(res.status).toBe(401)
  })

  it('returns the guard denial for a restricted manager without the grant', async () => {
    guardAccess.mockResolvedValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await GET(getRequest())
    expect(res.status).toBe(403)
    expect(prisma.area.findMany).not.toHaveBeenCalled()
  })

  it('lists only rooms whose names look like calendar identifiers', async () => {
    prisma.area.findMany.mockResolvedValue([
      { id: 'j1', name: '3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c', _count: { feeds: 1, events: 2 } },
      { id: 'a1', name: 'TE KAWAU ROOM', _count: { feeds: 0, events: 0 } },
    ])
    const res = await GET(getRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rooms).toEqual([
      { id: 'j1', name: '3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c', feedCount: 1, eventCount: 2 },
    ])
  })

  it('counts only live feeds and events', async () => {
    prisma.area.findMany.mockResolvedValue([
      { id: 'j1', name: '3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c', _count: { feeds: 1, events: 0 } },
    ])
    await GET(getRequest())
    expect(prisma.area.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: {
            select: {
              feeds: { where: { deletedAt: null } },
              events: { where: { deletedAt: null } },
            },
          },
        }),
      }),
    )
  })
})

describe('POST /api/admin/areas/cleanup', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await POST(postRequest({ areaId: 'j1', action: 'REMOVE' }))
    expect(res.status).toBe(401)
  })

  it('returns the guard denial for a restricted manager without the grant', async () => {
    guardAccess.mockResolvedValueOnce(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await POST(postRequest({ areaId: 'j1', action: 'REMOVE' }))
    expect(res.status).toBe(403)
    expect(prisma.calendarFeed.updateMany).not.toHaveBeenCalled()
  })

  it('404s for a room outside the effective venue', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'm1', role: 'MANAGER', venueId: 'v2', availableVenueIds: ['v2'] },
    })
    prisma.area.findFirst.mockResolvedValue(null)
    const res = await POST(postRequest({ areaId: 'j1', action: 'REMOVE' }))
    expect(res.status).toBe(404)
    expect(prisma.calendarFeed.updateMany).not.toHaveBeenCalled()
  })

  it('re-homes the feeds and events into a real room and removes the junk room', async () => {
    prisma.area.findFirst
      .mockResolvedValueOnce({ id: 'j1', venueId: 'v1', name: '3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c' })
      .mockResolvedValueOnce({ id: 'a1' })

    const res = await POST(postRequest({ venueId: 'v1', areaId: 'j1', action: 'REHOME', targetAreaId: 'a1' }))
    expect(res.status).toBe(200)
    expect(prisma.calendarFeed.updateMany).toHaveBeenCalledWith({
      where: { areaId: 'j1', deletedAt: null },
      data: { areaId: 'a1', roomDismissed: false },
    })
    expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: { areaId: 'j1', deletedAt: null },
      data: { areaId: 'a1' },
    })
    const body = await res.json()
    expect(body).toMatchObject({ action: 'REHOME', movedFeeds: 1, movedEvents: 2 })
  })

  it('removes the junk room, leaving its calendars unassigned and dismissed', async () => {
    prisma.area.findFirst.mockResolvedValueOnce({ id: 'j1', venueId: 'v1', name: '3f9a2b7c8d1e4f5a6b7c8d9e0f1a2b3c' })

    const res = await POST(postRequest({ venueId: 'v1', areaId: 'j1', action: 'REMOVE' }))
    expect(res.status).toBe(200)
    expect(prisma.calendarFeed.updateMany).toHaveBeenCalledWith({
      where: { areaId: 'j1', deletedAt: null },
      data: { areaId: null, roomDismissed: true },
    })
  })

  it('rejects an unknown action', async () => {
    prisma.area.findFirst.mockResolvedValueOnce({ id: 'j1', venueId: 'v1', name: 'JUNK' })
    const res = await POST(postRequest({ venueId: 'v1', areaId: 'j1', action: 'DELETE' }))
    expect(res.status).toBe(400)
  })
})
