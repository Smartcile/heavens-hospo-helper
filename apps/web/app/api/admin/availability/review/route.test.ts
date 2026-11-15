import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, getManagerVenueId, cancelPendingAvailability, supersedeRequestsCoveredBy } = vi.hoisted(() => ({
  db: {
    staffAvailability: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  cancelPendingAvailability: vi.fn(),
  supersedeRequestsCoveredBy: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({ cancelPendingAvailability, supersedeRequestsCoveredBy }))

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
  db.staffAvailability.findMany.mockResolvedValue([])
  supersedeRequestsCoveredBy.mockResolvedValue(0)
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

describe('POST /api/admin/availability/review APPROVE lock rule', () => {
  it('locks a single-day declaration', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ staffId: 'st1', date: new Date('2026-10-20T00:00:00Z') }])

    const res = await POST(req({ action: 'APPROVE', ids: ['a1'] }))

    expect(res.status).toBe(200)
    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data.lockedAt).toBeInstanceOf(Date)
    expect(data.lockedById).toBe('u1')
    expect(supersedeRequestsCoveredBy).toHaveBeenCalledWith({
      staffId: 'st1',
      venueId: 'v1',
      dates: ['2026-10-20'],
      actorId: 'u1',
    })
  })

  it('does not lock a multi-day selection', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([])

    await POST(req({ action: 'APPROVE', ids: ['a1', 'a2'] }))

    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty('lockedAt')
    expect(data).not.toHaveProperty('lockedById')
  })

  it('does not lock a series approval', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([{ staffId: 'st1', date: new Date('2026-10-20T00:00:00Z') }])

    await POST(req({ action: 'APPROVE', seriesId: 's1', staffId: 'st1' }))

    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty('lockedAt')
    expect(supersedeRequestsCoveredBy).toHaveBeenCalledWith({
      staffId: 'st1',
      venueId: 'v1',
      dates: ['2026-10-20'],
      actorId: 'u1',
    })
  })

  it('never locks on a decline and does not supersede', async () => {
    await POST(req({ action: 'DECLINE', ids: ['a1'] }))

    const data = db.staffAvailability.updateMany.mock.calls[0][0].data
    expect(data).not.toHaveProperty('lockedAt')
    expect(supersedeRequestsCoveredBy).not.toHaveBeenCalled()
  })

  it('only supersedes on APPROVED dates, never a DECLINED occurrence in the series', async () => {
    // The series has an APPROVED day and a DECLINED day. The confirmed query
    // asks for APPROVED rows only, so the declined date cannot cover a request.
    db.staffAvailability.findMany.mockResolvedValueOnce([
      { staffId: 'st1', date: new Date('2026-10-15T00:00:00Z') },
    ])
    supersedeRequestsCoveredBy.mockResolvedValue(2)

    const res = await POST(req({ action: 'APPROVE', seriesId: 's1', staffId: 'st1' }))

    expect(db.staffAvailability.findMany.mock.calls[0][0].where).toMatchObject({ status: 'APPROVED' })
    expect(supersedeRequestsCoveredBy).toHaveBeenCalledTimes(1)
    expect(supersedeRequestsCoveredBy).toHaveBeenCalledWith({
      staffId: 'st1',
      venueId: 'v1',
      dates: ['2026-10-15'],
      actorId: 'u1',
    })
    expect(await res.json()).toEqual({ updated: 2, superseded: 2 })
  })
})
