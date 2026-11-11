import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { getServerSession, guardAccess, getManagerVenueId, getAccessibleVenueIds, resolveRetrainRequest, prisma } =
  vi.hoisted(() => ({
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    getManagerVenueId: vi.fn(),
    getAccessibleVenueIds: vi.fn(),
    resolveRetrainRequest: vi.fn(),
    prisma: { guideRetrainRequest: { findFirst: vi.fn() } },
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getAccessibleVenueIds }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/guide-warnings.server', () => ({ resolveRetrainRequest }))

import { PATCH } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 'r1' } }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  getAccessibleVenueIds.mockReturnValue(['v1', 'v2'])
  prisma.guideRetrainRequest.findFirst.mockResolvedValue({ venueId: 'v2' })
  resolveRetrainRequest.mockResolvedValue({ ok: true, request: { id: 'r1', status: 'DONE' } })
})

describe('PATCH /api/admin/guide-retrain/[id]', () => {
  it('requires the assign grant', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(403)
  })

  it('rejects an unknown action', async () => {
    const res = await PATCH(req({ action: 'DELETE' }), params)
    expect(res.status).toBe(400)
  })

  it('resolves an admin request in the request venue', async () => {
    const res = await PATCH(req({ action: 'RESOLVE', note: 'REDONE' }), params)
    expect(resolveRetrainRequest).toHaveBeenCalledWith({
      id: 'r1',
      venueId: 'v2',
      status: 'DONE',
      resolvedById: 'u1',
      note: 'REDONE',
    })
    expect(res.status).toBe(200)
  })

  it('maps DISMISS to DISMISSED', async () => {
    await PATCH(req({ action: 'DISMISS' }), params)
    expect(resolveRetrainRequest).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISMISSED' }),
    )
  })

  it('rejects a request from a venue the admin cannot access', async () => {
    getAccessibleVenueIds.mockReturnValue(['v1'])
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(403)
  })

  it('passes a closed-request 409 through', async () => {
    resolveRetrainRequest.mockResolvedValue({ ok: false, status: 409, error: 'REQUEST ALREADY CLOSED' })
    const res = await PATCH(req({ action: 'RESOLVE' }), params)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'REQUEST ALREADY CLOSED' })
  })
})
