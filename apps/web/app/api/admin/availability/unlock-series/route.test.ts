import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getServerSession, unlockSeriesAvailability } = vi.hoisted(() => ({
  db: {
    staff: { findFirst: vi.fn(), findUnique: vi.fn() },
    staffAvailability: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  getServerSession: vi.fn(),
  unlockSeriesAvailability: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({ unlockSeriesAvailability }))

import { GET, POST } from './route'

function makeReq(url: string, body: unknown = null): NextRequest {
  return {
    nextUrl: new URL(url),
    cookies: { get: () => undefined },
    json: async () => body,
  } as unknown as NextRequest
}

const getUrl = 'http://localhost/api/admin/availability/unlock-series?staffId=st1&seriesId=s1&venueId=v1'

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  db.staff.findFirst.mockResolvedValue({ id: 'st1' })
  db.staff.findUnique.mockResolvedValue({ restricted: false })
  db.staffAvailability.findMany.mockResolvedValue([])
  db.staffAvailability.findFirst.mockResolvedValue({ id: 'row1' })
  unlockSeriesAvailability.mockResolvedValue({ unlocked: [], count: 0 })
})

describe('GET /api/admin/availability/unlock-series', () => {
  it('lists every series date with its lock state', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([
      { date: new Date('2026-10-01T00:00:00Z'), lockedAt: new Date('2026-10-02T01:00:00Z'), lockedReason: 'CONFIRMED' },
      { date: new Date('2026-10-08T00:00:00Z'), lockedAt: null, lockedReason: null },
    ])

    const res = await GET(makeReq(getUrl))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ staffId: 'st1', seriesId: 's1', total: 2, lockedCount: 1 })
    expect(json.dates).toEqual([
      { date: '2026-10-01', locked: true, lockedAt: '2026-10-02T01:00:00.000Z', lockedReason: 'CONFIRMED' },
      { date: '2026-10-08', locked: false, lockedAt: null, lockedReason: null },
    ])
  })

  it('locks a manager to their own venue regardless of the query', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'u1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })
    db.staffAvailability.findMany.mockResolvedValueOnce([
      { date: new Date('2026-10-01T00:00:00Z'), lockedAt: null, lockedReason: null },
    ])

    const res = await GET(makeReq('http://localhost/api/admin/availability/unlock-series?staffId=st1&seriesId=s1&venueId=v2'))
    expect(res.status).toBe(200)
    expect(db.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'st1', venueId: 'v1', deletedAt: null } }),
    )
  })

  it('returns 400 without a series id', async () => {
    const res = await GET(makeReq('http://localhost/api/admin/availability/unlock-series?staffId=st1'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the staff member is not in the venue', async () => {
    db.staff.findFirst.mockResolvedValueOnce(null)
    const res = await GET(makeReq(getUrl))
    expect(res.status).toBe(404)
  })

  it('returns 404 when the series has no rows', async () => {
    db.staffAvailability.findMany.mockResolvedValueOnce([])
    const res = await GET(makeReq(getUrl))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/admin/availability/unlock-series', () => {
  it('unlocks the whole series when no dates are supplied', async () => {
    unlockSeriesAvailability.mockResolvedValueOnce({ unlocked: ['2026-10-01', '2026-10-08'], count: 2 })

    const res = await POST(makeReq(getUrl, { staffId: 'st1', venueId: 'v1', seriesId: 's1' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ success: true, unlocked: ['2026-10-01', '2026-10-08'], count: 2 })
    expect(unlockSeriesAvailability).toHaveBeenCalledWith({
      staffId: 'st1',
      venueId: 'v1',
      seriesId: 's1',
      dates: undefined,
      actorId: 'u1',
    })
  })

  it('unlocks only the selected dates', async () => {
    unlockSeriesAvailability.mockResolvedValueOnce({ unlocked: ['2026-10-08'], count: 1 })

    const res = await POST(makeReq(getUrl, {
      staffId: 'st1',
      venueId: 'v1',
      seriesId: 's1',
      dates: ['2026-10-08'],
    }))

    expect(res.status).toBe(200)
    expect(unlockSeriesAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ dates: ['2026-10-08'] }),
    )
  })

  it('returns 400 for a malformed date', async () => {
    const res = await POST(makeReq(getUrl, { staffId: 'st1', venueId: 'v1', seriesId: 's1', dates: ['nope'] }))
    expect(res.status).toBe(400)
    expect(unlockSeriesAvailability).not.toHaveBeenCalled()
  })

  it('returns 404 when the series is missing', async () => {
    db.staffAvailability.findFirst.mockResolvedValueOnce(null)
    const res = await POST(makeReq(getUrl, { staffId: 'st1', venueId: 'v1', seriesId: 's1' }))
    expect(res.status).toBe(404)
    expect(unlockSeriesAvailability).not.toHaveBeenCalled()
  })

  it('returns 403 for a floor-staff session', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'u1', role: 'STAFF', venueId: 'v1', availableVenueIds: ['v1'] },
    })
    const res = await POST(makeReq(getUrl, { staffId: 'st1', venueId: 'v1', seriesId: 's1' }))
    expect(res.status).toBe(403)
    expect(unlockSeriesAvailability).not.toHaveBeenCalled()
  })
})
