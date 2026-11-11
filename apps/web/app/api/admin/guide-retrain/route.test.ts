import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { getServerSession, guardAccess, getManagerVenueId, getAccessibleVenueIds, createRetrainRequests, prisma } =
  vi.hoisted(() => ({
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    getManagerVenueId: vi.fn(),
    getAccessibleVenueIds: vi.fn(),
    createRetrainRequests: vi.fn(),
    prisma: { staff: { findFirst: vi.fn() } },
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId, getAccessibleVenueIds }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/guide-warnings.server', () => ({ createRetrainRequests }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue('v1')
  getAccessibleVenueIds.mockReturnValue(['v1', 'v2'])
  prisma.staff.findFirst.mockResolvedValue({ venueId: 'v1' })
  createRetrainRequests.mockResolvedValue({
    ok: true,
    result: { created: [{ id: 'r1', guideId: 'g1' }], skipped: [] },
  })
})

describe('POST /api/admin/guide-retrain', () => {
  it('requires the assign grant', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await POST(req({ staffId: 's1', guideIds: ['g1'] }))
    expect(res.status).toBe(403)
    expect(createRetrainRequests).not.toHaveBeenCalled()
  })

  it('rejects a missing staff id', async () => {
    const res = await POST(req({ guideIds: ['g1'] }))
    expect(res.status).toBe(400)
  })

  it('rejects a venue the session cannot access', async () => {
    const res = await POST(req({ staffId: 's1', guideIds: ['g1'], venueId: 'v3' }))
    expect(res.status).toBe(403)
  })

  it('derives the venue from the target person when an admin sends none', async () => {
    const res = await POST(req({ staffId: 's1', guideIds: ['g1'], reason: 'MENU CHANGED' }))
    expect(prisma.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 's1' }) }),
    )
    expect(createRetrainRequests).toHaveBeenCalledWith({
      venueId: 'v1',
      staffId: 's1',
      guideIds: ['g1'],
      reason: 'MENU CHANGED',
      requestedById: 'u1',
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ created: [{ id: 'r1', guideId: 'g1' }] })
  })

  it('pins a manager to their effective venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'v1' } })
    await POST(req({ staffId: 's1', guideIds: ['g1'], venueId: 'v2' }))
    expect(getManagerVenueId).toHaveBeenCalled()
    expect(createRetrainRequests).toHaveBeenCalledWith(expect.objectContaining({ venueId: 'v1' }))
  })

  it('passes a server-side failure status through', async () => {
    createRetrainRequests.mockResolvedValue({ ok: false, status: 404, error: 'STAFF NOT FOUND' })
    const res = await POST(req({ staffId: 's1', guideIds: ['g1'] }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'STAFF NOT FOUND' })
  })
})
