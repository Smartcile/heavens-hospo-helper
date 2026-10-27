import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, getManagerVenueId, saveAvailability } = vi.hoisted(() => ({
  db: {
    staff: { findFirst: vi.fn() },
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
  loadSeriesSummaries: vi.fn(),
  mapAvailabilityEntry: vi.fn(),
  mapEditRequest: vi.fn(),
  parseRepeat: vi.fn(() => null),
  parseScope: vi.fn(() => null),
  saveAvailability,
}))

import { POST } from './route'

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
