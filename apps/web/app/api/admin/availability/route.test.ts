import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, getManagerVenueId, saveAvailability } = vi.hoisted(() => ({
  db: {
    staff: { findFirst: vi.fn(), findMany: vi.fn() },
    venue: { findUnique: vi.fn() },
    position: { findMany: vi.fn() },
    staffAvailability: { findMany: vi.fn() },
    availabilityEditRequest: { findMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  saveAvailability: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({
  loadSeriesSummaries: vi.fn(async () => []),
  mapAvailabilityEntry: vi.fn((r: { id: string }) => ({ id: r.id })),
  mapEditRequest: vi.fn((r: { id: string }) => ({ id: r.id })),
  parseRepeat: vi.fn(() => null),
  parseScope: vi.fn(() => null),
  saveAvailability,
}))

import { GET, POST } from './route'

const req = (body: unknown) => ({ json: async () => body } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue('v1')
  db.staff.findFirst.mockResolvedValue({ id: 'st1' })
})

describe('GET /api/admin/availability (off-range edit requests)', () => {
  it('includes the current day for a request outside the visible range', async () => {
    db.venue.findUnique.mockResolvedValue({ availabilityPresets: null })
    db.staff.findMany.mockResolvedValue([
      { id: 'st1', firstName: 'ANN', lastName: 'LEE', employmentType: 'FULL_TIME', positions: [] },
    ])
    db.position.findMany.mockResolvedValue([])
    db.staffAvailability.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'off1', staffId: 'st1', date: new Date('2026-10-15T00:00:00Z'), seriesId: null },
      ])
    db.availabilityEditRequest.findMany.mockResolvedValue([
      {
        id: 'r1',
        staffId: 'st1',
        date: new Date('2026-10-15T00:00:00Z'),
        action: 'SET',
        scope: 'THIS',
        payload: {},
        reason: null,
        status: 'PENDING',
        reviewNote: null,
        createdAt: new Date(),
        seriesId: null,
      },
    ])

    const res = await GET(
      new NextRequest('http://localhost/api/admin/availability?venueId=v1&start=2026-10-26&end=2026-11-01'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.entries).toEqual([{ id: 'off1' }])
    expect(db.staffAvailability.findMany).toHaveBeenCalledTimes(3)
  })
})

describe('POST /api/admin/availability (locked day)', () => {
  it('returns 409 with the locked dates instead of writing', async () => {
    saveAvailability.mockResolvedValueOnce({
      error: 'LOCKED — UNLOCK FIRST',
      locked: ['2026-10-08'],
    })

    const res = await POST(req({
      staffId: 'st1',
      date: '2026-10-08',
      availability: { isAllDay: true, type: 'UNAVAILABLE' },
    }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'LOCKED — UNLOCK FIRST', locked: ['2026-10-08'] })
  })
})
