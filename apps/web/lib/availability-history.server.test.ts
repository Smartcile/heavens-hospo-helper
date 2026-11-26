import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    venue: { findUnique: vi.fn() },
    staff: { findMany: vi.fn() },
    availabilityEditRequest: { findMany: vi.fn() },
    staffAvailability: { findMany: vi.fn() },
    availabilityComment: { findMany: vi.fn() },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma: db, Prisma: { DbNull: null } }))

import { HISTORY_REQUEST_CAP, loadAvailabilityHistory } from '@/lib/availability-history.server'

const day = (key: string) => new Date(`${key}T00:00:00Z`)

const requestRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  staffId: 'st1',
  venueId: 'v1',
  scope: 'THIS',
  date: day('2026-10-15'),
  seriesId: null,
  action: 'SET',
  payload: { writeDates: ['2026-10-15'], removeDates: [] },
  reason: null,
  status: 'PENDING',
  reviewNote: null,
  reviewedById: null,
  reviewedAt: null,
  createdAt: day('2026-10-01'),
  deletedAt: null,
  ...over,
})

const dayRow = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  staffId: 'st1',
  venueId: 'v1',
  date: day('2026-10-15'),
  type: 'UNAVAILABLE',
  isAllDay: true,
  startTime: null,
  endTime: null,
  segments: null,
  status: 'APPROVED',
  timeOff: false,
  notes: null,
  reason: null,
  reviewNote: null,
  reviewedById: 'm1',
  reviewedAt: day('2026-10-02'),
  lockedAt: null,
  lockedById: null,
  lockedReason: null,
  seriesId: null,
  seriesEndDate: null,
  deletedAt: null,
  ...over,
})

const window = { venueId: 'v1', from: '2026-10-01', to: '2026-10-31' }

beforeEach(() => {
  vi.clearAllMocks()
  db.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  db.staff.findMany.mockResolvedValue([
    { id: 'st1', firstName: 'TAYLOR', lastName: 'REED', isActive: true, deletedAt: null },
    { id: 'm1', firstName: 'MORGAN', lastName: 'LEE', isActive: true, deletedAt: null },
    { id: 'gone', firstName: 'GONE', lastName: 'STAFF', isActive: false, deletedAt: new Date() },
  ])
  db.availabilityEditRequest.findMany.mockResolvedValue([])
  db.staffAvailability.findMany.mockResolvedValue([])
  db.availabilityComment.findMany.mockResolvedValue([])
})

describe('loadAvailabilityHistory', () => {
  it('returns every request status with reviewer names, including withdrawn and automatic ones', async () => {
    db.availabilityEditRequest.findMany.mockResolvedValue([
      requestRow({
        id: 'applied',
        date: day('2026-09-01'),
        payload: { writeDates: ['2026-10-15'], removeDates: [] },
        status: 'APPLIED',
        reviewedById: 'm1',
        reviewedAt: day('2026-10-03'),
      }),
      requestRow({ id: 'withdrawn', status: 'DISCARDED', reviewedById: 'st1', reviewedAt: day('2026-10-04'), deletedAt: day('2026-10-04') }),
      requestRow({ id: 'superseded', status: 'SUPERSEDED', reviewedAt: day('2026-10-05'), reviewNote: 'SUPERSEDED BY A NEWER REQUEST' }),
    ])

    const out = await loadAvailabilityHistory(window)

    expect(out.requests.map((r) => r.id)).toEqual(['withdrawn', 'superseded', 'applied'])
    expect(out.requests[0]).toMatchObject({ withdrawn: true, reviewedByLabel: 'TAYLOR REED' })
    expect(out.requests[1].reviewedByLabel).toBe('AUTOMATIC')
    expect(out.requests[2].reviewedByLabel).toBe('MORGAN LEE')
    // The APPLIED request is anchored in September but targets a day in range.
    expect(out.requests.some((r) => r.id === 'applied')).toBe(true)
    // A request anchored after the window cannot target inside it.
    expect(db.availabilityEditRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ venueId: 'v1', date: { lte: day('2026-10-31') } }),
    }))
  })

  it('filters requests by status', async () => {
    db.availabilityEditRequest.findMany.mockResolvedValue([
      requestRow({ id: 'a', status: 'APPLIED' }),
      requestRow({ id: 'b', status: 'PENDING' }),
    ])

    const out = await loadAvailabilityHistory({ ...window, status: 'applied' })

    expect(out.requests.map((r) => r.id)).toEqual(['a'])
  })

  it('excludes withdrawn requests and cancelled days when includeDeleted is false', async () => {
    db.availabilityEditRequest.findMany.mockResolvedValue([
      requestRow({ id: 'live' }),
      requestRow({ id: 'withdrawn', status: 'DISCARDED', deletedAt: day('2026-10-04') }),
    ])
    db.staffAvailability.findMany.mockResolvedValue([
      dayRow({ id: 'live-day' }),
      dayRow({ id: 'cancelled', deletedAt: day('2026-10-04') }),
    ])

    const out = await loadAvailabilityHistory({ ...window, includeDeleted: false })

    expect(out.requests.map((r) => r.id)).toEqual(['live'])
    expect(out.days.map((d) => d.id)).toEqual(['live-day'])
    expect(db.availabilityEditRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ deletedAt: null }),
    }))
  })

  it('scopes to one staff member and keeps cancelled days badged with their reviewer', async () => {
    db.staffAvailability.findMany.mockResolvedValue([
      dayRow({ id: 'd1', deletedAt: day('2026-10-04') }),
      dayRow({ id: 'd2', staffId: 'm1', date: day('2026-10-16') }),
    ])

    const out = await loadAvailabilityHistory({ ...window, staffId: 'st1' })

    expect(db.staffAvailability.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ staffId: 'st1' }),
    }))
    expect(out.days.map((d) => d.id)).toEqual(['d1'])
    expect(out.days[0]).toMatchObject({ cancelled: true, staffName: 'TAYLOR REED', reviewedByName: 'MORGAN LEE' })
    // The picker offers active staff plus anyone referenced by this window.
    expect(out.staff.map((s) => s.id)).toEqual(['m1', 'st1'])
  })

  it('attaches day comments and reports truncation at the cap', async () => {
    db.staffAvailability.findMany.mockResolvedValue([dayRow()])
    db.availabilityComment.findMany.mockResolvedValue([
      {
        id: 'c1', staffId: 'st1', date: day('2026-10-15'), body: 'CALLED THE VENUE', source: 'MANAGER',
        authorId: 'm1', createdAt: day('2026-10-03'),
      },
    ])
    db.availabilityEditRequest.findMany.mockResolvedValue(
      Array.from({ length: HISTORY_REQUEST_CAP }, (_, i) => requestRow({ id: `r${i}` })),
    )

    const out = await loadAvailabilityHistory(window)

    expect(out.days[0].comments).toEqual([
      expect.objectContaining({ id: 'c1', authorName: 'MORGAN LEE' }),
    ])
    expect(out.truncated).toBe(true)
  })
})
