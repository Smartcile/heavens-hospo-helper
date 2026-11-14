import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, getManagerVenueId, applyEditRequest, discardEditRequest, markEditRequestApplied } = vi.hoisted(() => ({
  db: {
    availabilityEditRequest: {
      findUnique: vi.fn(),
    },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  applyEditRequest: vi.fn(),
  discardEditRequest: vi.fn(),
  markEditRequestApplied: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({
  applyEditRequest,
  discardEditRequest,
  markEditRequestApplied,
}))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)
const params = { params: { id: 'r1' } }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue('v1')
  db.availabilityEditRequest.findUnique.mockResolvedValue({
    id: 'r1',
    venueId: 'v1',
    deletedAt: null,
    status: 'PENDING',
  })
})

describe('POST /api/admin/availability/requests/[id] APPLY', () => {
  it('returns 409 LOCKED with the skipped dates and keeps the request pending', async () => {
    applyEditRequest.mockResolvedValue({ applied: false, reason: 'LOCKED', skipped: ['2026-10-15'], wrote: 0 })

    const res = await POST(req({ action: 'APPLY' }), params)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'LOCKED — UNLOCK FIRST',
      locked: ['2026-10-15'],
      skipped: ['2026-10-15'],
    })
  })

  it('returns 409 PAST when every target is in the past', async () => {
    applyEditRequest.mockResolvedValue({ applied: false, reason: 'PAST', skipped: ['2026-10-01'], wrote: 0 })

    const res = await POST(req({ action: 'APPLY' }), params)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: 'ALL DAYS ARE IN THE PAST — DISCARD THIS REQUEST',
      skipped: ['2026-10-01'],
    })
  })

  it('returns 409 when the request is already resolved', async () => {
    applyEditRequest.mockResolvedValue({ applied: false, reason: 'RESOLVED', skipped: [], wrote: 0 })

    const res = await POST(req({ action: 'APPLY' }), params)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'REQUEST ALREADY RESOLVED' })
  })

  it('returns success with the written count and skipped days on a partial apply', async () => {
    applyEditRequest.mockResolvedValue({ applied: true, skipped: ['2026-10-15'], wrote: 2 })

    const res = await POST(req({ action: 'APPLY' }), params)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, skipped: ['2026-10-15'], wrote: 2 })
  })
})

describe('POST /api/admin/availability/requests/[id] DISCARD / MARK_APPLIED', () => {
  it('discards a pending request', async () => {
    discardEditRequest.mockResolvedValue(true)

    const res = await POST(req({ action: 'DISCARD' }), params)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, skipped: [] })
  })

  it('returns 409 when a discard targets an already-resolved request', async () => {
    discardEditRequest.mockResolvedValue(false)

    const res = await POST(req({ action: 'DISCARD' }), params)

    expect(res.status).toBe(409)
  })
})
