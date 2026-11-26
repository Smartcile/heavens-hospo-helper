import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, getAccessibleVenueIds } = vi.hoisted(() => ({
  prisma: {
    floorPlan: { findFirst: vi.fn(), update: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getAccessibleVenueIds: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getAccessibleVenueIds }))

import { PUT } from './route'

const managerSession = {
  user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
}
const adminSession = {
  user: { id: 'a1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1', 'v2'] },
}

const req = (body: unknown) =>
  ({
    json: async () => body,
    cookies: { get: () => undefined },
  }) as unknown as NextRequest

const params = { params: { id: 'plan-1' } }

describe('PUT /api/admin/floorplan/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(adminSession)
    guardAccess.mockResolvedValue(null)
    getAccessibleVenueIds.mockReturnValue(['v1', 'v2'])
    prisma.floorPlan.findFirst.mockResolvedValue({ id: 'plan-1', venueId: 'v1' })
    prisma.floorPlan.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'plan-1',
      ...data,
    }))
  })

  it('rejects an unauthenticated request', async () => {
    getServerSession.mockResolvedValue(null)
    const res = await PUT(req({ backgroundOpacity: 0.5 }), params)
    expect(res.status).toBe(401)
    expect(prisma.floorPlan.update).not.toHaveBeenCalled()
  })

  it('honours the permission guard', async () => {
    guardAccess.mockResolvedValue(new Response('Forbidden', { status: 403 }) as never)
    const res = await PUT(req({ backgroundOpacity: 0.5 }), params)
    expect(res.status).toBe(403)
  })

  it('404s a missing or deleted plan', async () => {
    prisma.floorPlan.findFirst.mockResolvedValue(null)
    const res = await PUT(req({ backgroundOpacity: 0.5 }), params)
    expect(res.status).toBe(404)
    expect(prisma.floorPlan.update).not.toHaveBeenCalled()
  })

  it('blocks a manager editing another venue’s plan', async () => {
    getServerSession.mockResolvedValue(managerSession)
    getAccessibleVenueIds.mockReturnValue(['v1'])
    prisma.floorPlan.findFirst.mockResolvedValue({ id: 'plan-1', venueId: 'v2' })

    const res = await PUT(req({ backgroundOpacity: 0.5 }), params)

    expect(res.status).toBe(403)
    expect(prisma.floorPlan.update).not.toHaveBeenCalled()
  })

  it('allows a manager to edit a plan in their effective venue', async () => {
    getServerSession.mockResolvedValue(managerSession)
    const res = await PUT(req({
      backgroundImageUrl: '/api/upload/drawing.png',
      backgroundOpacity: 0.4,
      backgroundOffsetX: 10,
      backgroundOffsetY: -5,
      backgroundScale: 2.5,
    }), params)

    expect(res.status).toBe(200)
    expect(prisma.floorPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: {
        backgroundImageUrl: '/api/upload/drawing.png',
        backgroundOpacity: 0.4,
        backgroundScale: 2.5,
        backgroundOffsetX: 10,
        backgroundOffsetY: -5,
      },
    })
  })

  it('blocks an admin from a venue they cannot access', async () => {
    getAccessibleVenueIds.mockReturnValue(['v1'])
    prisma.floorPlan.findFirst.mockResolvedValue({ id: 'plan-1', venueId: 'v2' })
    const res = await PUT(req({ backgroundOpacity: 0.5 }), params)
    expect(res.status).toBe(403)
  })

  it('clears the image URL without dropping the calibration', async () => {
    const res = await PUT(req({ backgroundImageUrl: null }), params)
    expect(res.status).toBe(200)
    expect(prisma.floorPlan.update).toHaveBeenCalledWith({
      where: { id: 'plan-1' },
      data: { backgroundImageUrl: null },
    })
  })

  it('rejects an out-of-range opacity', async () => {
    const res = await PUT(req({ backgroundOpacity: 1.5 }), params)
    expect(res.status).toBe(400)
    expect(prisma.floorPlan.update).not.toHaveBeenCalled()
  })

  it('rejects a non-positive scale', async () => {
    const res = await PUT(req({ backgroundScale: 0 }), params)
    expect(res.status).toBe(400)
    expect(prisma.floorPlan.update).not.toHaveBeenCalled()
  })

  it('rejects a non-numeric offset', async () => {
    const res = await PUT(req({ backgroundOffsetX: 'left' }), params)
    expect(res.status).toBe(400)
    expect(prisma.floorPlan.update).not.toHaveBeenCalled()
  })
})
