import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getServerSession, clearAvailability, parseScope } = vi.hoisted(() => ({
  db: {
    staff: { findFirst: vi.fn() },
    availabilityEditRequest: { updateMany: vi.fn() },
  },
  getServerSession: vi.fn(),
  clearAvailability: vi.fn(),
  parseScope: vi.fn((raw: unknown) => raw ?? null),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({ clearAvailability, parseScope }))

import { POST } from './route'

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

const body = { staffId: 'st1', venueId: 'v1', date: '2026-10-08', scope: 'ALL', seriesId: 's1' }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  db.staff.findFirst.mockResolvedValue({ id: 'st1' })
  db.availabilityEditRequest.updateMany.mockResolvedValue({ count: 0 })
  clearAvailability.mockResolvedValue({ mode: 'SAVED', skipped: [], plan: { removeDates: [] } })
})

describe('POST /api/admin/availability/delete-series', () => {
  it('is ADMIN only', async () => {
    getServerSession.mockResolvedValue({
      user: { id: 'u1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })

    const res = await POST(req(body))
    expect(res.status).toBe(403)
    expect(clearAvailability).not.toHaveBeenCalled()
  })

  it('requires a series day', async () => {
    const res = await POST(req({ ...body, seriesId: null }))
    expect(res.status).toBe(400)
    expect(clearAvailability).not.toHaveBeenCalled()
  })

  it('refuses staff from another venue', async () => {
    db.staff.findFirst.mockResolvedValue(null)

    const res = await POST(req(body))
    expect(res.status).toBe(404)
    expect(clearAvailability).not.toHaveBeenCalled()
  })

  it('forwards the scope and discards pending requests for the removed days', async () => {
    clearAvailability.mockResolvedValueOnce({
      mode: 'SAVED',
      skipped: ['2026-10-15'],
      plan: { removeDates: ['2026-10-08', '2026-10-15'] },
    })

    const res = await POST(req({ ...body, scope: 'FROM' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ mode: 'SAVED', skipped: ['2026-10-15'] })
    expect(clearAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'st1', venueId: 'v1', dateKey: '2026-10-08', scope: 'FROM', seriesId: 's1' }),
      expect.objectContaining({ bypass: true }),
    )
    expect(db.availabilityEditRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          staffId: 'st1',
          venueId: 'v1',
          status: 'PENDING',
          date: { in: [new Date('2026-10-08T00:00:00.000Z'), new Date('2026-10-15T00:00:00.000Z')] },
        }),
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    )
  })

  it('returns 409 when every target day is locked', async () => {
    clearAvailability.mockResolvedValueOnce({ error: 'LOCKED — UNLOCK FIRST', locked: ['2026-10-08'] })

    const res = await POST(req(body))
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'LOCKED — UNLOCK FIRST', locked: ['2026-10-08'] })
    expect(db.availabilityEditRequest.updateMany).not.toHaveBeenCalled()
  })
})
