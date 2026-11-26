import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: {
    area: { findFirst: vi.fn(), update: vi.fn() },
    areaVenue: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
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

import { DELETE, PUT } from '@/app/api/admin/areas/[id]/route'

const params = { params: { id: 'a1' } }

function request(): NextRequest {
  return new NextRequest('http://localhost/api/admin/areas/a1', { method: 'DELETE' })
}

beforeEach(() => {
  vi.clearAllMocks()
  guardAccess.mockResolvedValue(null)
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  prisma.area.findFirst.mockResolvedValue({ id: 'a1', venueId: 'v1' })
  prisma.areaVenue.updateMany.mockResolvedValue({ count: 1 })
  prisma.calendarFeed.updateMany.mockResolvedValue({ count: 1 })
  prisma.calendarEvent.updateMany.mockResolvedValue({ count: 2 })
  prisma.area.update.mockResolvedValue({ id: 'a1' })
  prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops))
})

describe('DELETE /api/admin/areas/[id]', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await DELETE(request(), params)
    expect(res!.status).toBe(401)
  })

  it('returns the guard denial (e.g. a restricted manager without the grant)', async () => {
    guardAccess.mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    )
    const res = await DELETE(request(), params)
    expect(res!.status).toBe(403)
    expect(prisma.calendarFeed.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a room belonging to another venue', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })
    prisma.area.findFirst.mockResolvedValue({ id: 'a1', venueId: 'v2' })
    const res = await DELETE(request(), params)
    expect(res!.status).toBe(403)
    expect(prisma.area.update).not.toHaveBeenCalled()
  })

  it('unassigns the room feeds and marks them dismissed so the boot migration cannot re-create the room', async () => {
    const res = await DELETE(request(), params)
    expect(res!.status).toBe(200)
    expect(prisma.calendarFeed.updateMany).toHaveBeenCalledWith({
      where: { areaId: 'a1', deletedAt: null },
      data: { areaId: null, roomDismissed: true },
    })
    expect(prisma.calendarEvent.updateMany).toHaveBeenCalledWith({
      where: { areaId: 'a1', deletedAt: null },
      data: { areaId: null },
    })
    expect(prisma.areaVenue.updateMany).toHaveBeenCalledWith({
      where: { areaId: 'a1', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    })
  })
})

describe('PUT /api/admin/areas/[id]', () => {
  function putRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/admin/areas/a1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  beforeEach(() => {
    prisma.areaVenue.findMany.mockResolvedValue([{ venueId: 'v1', isOwner: true }])
    prisma.areaVenue.upsert.mockResolvedValue({})
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma))
  })

  it('rejects a manager whose active venue does not own the room', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })
    prisma.area.findFirst.mockResolvedValue({ id: 'a1', venueId: 'v2' })
    const res = await PUT(putRequest({ name: 'X' }), params)
    expect(res!.status).toBe(403)
    expect(prisma.area.update).not.toHaveBeenCalled()
  })

  it('shares a room by upserting AreaVenue rows and soft-deletes removed shares', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1', 'v2', 'v3'] },
    })
    prisma.areaVenue.findMany.mockResolvedValue([
      { venueId: 'v1', isOwner: true },
      { venueId: 'v3', isOwner: false },
    ])
    prisma.area.update.mockResolvedValue({ id: 'a1' })
    const res = await PUT(putRequest({ sharedVenueIds: ['v2'] }), params)
    expect(res!.status).toBe(200)
    expect(prisma.areaVenue.upsert).toHaveBeenCalledWith({
      where: { areaId_venueId: { areaId: 'a1', venueId: 'v2' } },
      update: { isOwner: false, deletedAt: null },
      create: { areaId: 'a1', venueId: 'v2', isOwner: false },
    })
    expect(prisma.areaVenue.updateMany).toHaveBeenCalledWith({
      where: { areaId: 'a1', venueId: { in: ['v3'] } },
      data: { deletedAt: expect.any(Date) },
    })
  })
})
