import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, getManagerVenueId, cancelPendingAvailability } = vi.hoisted(() => ({
  db: {
    staffAvailability: {
      updateMany: vi.fn(),
    },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  cancelPendingAvailability: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({ cancelPendingAvailability }))

import { POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue('v1')
  db.staffAvailability.updateMany.mockResolvedValue({ count: 2 })
})

describe('POST /api/admin/availability/review NOTE', () => {
  it('updates the review note across the given ids without changing status', async () => {
    const res = await POST(req({
      action: 'NOTE',
      ids: ['a1', 'a2'],
      reviewNote: '  CHECKED BY PHONE  ',
    }))

    expect(res.status).toBe(200)
    const call = db.staffAvailability.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: { in: ['a1', 'a2'] }, venueId: 'v1', deletedAt: null })
    // Only the note — never status, lock, availability or series membership.
    expect(call.data).toEqual({ reviewNote: 'CHECKED BY PHONE' })
    expect(await res.json()).toEqual({ updated: 2 })
  })

  it('updates a whole series declaration by seriesId + staffId', async () => {
    await POST(req({
      action: 'NOTE',
      seriesId: 's1',
      staffId: 'st1',
      reviewNote: 'CALLED THE VENUE',
    }))

    const call = db.staffAvailability.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ seriesId: 's1', staffId: 'st1', venueId: 'v1', deletedAt: null })
    expect(call.data).toEqual({ reviewNote: 'CALLED THE VENUE' })
  })

  it('clears the note when the value is blank', async () => {
    await POST(req({ action: 'NOTE', ids: ['a1'], reviewNote: '   ' }))

    expect(db.staffAvailability.updateMany.mock.calls[0][0].data).toEqual({ reviewNote: null })
  })

  it('still rejects an unknown action', async () => {
    const res = await POST(req({ action: 'NOPE', ids: ['a1'] }))

    expect(res.status).toBe(400)
    expect(db.staffAvailability.updateMany).not.toHaveBeenCalled()
  })
})
