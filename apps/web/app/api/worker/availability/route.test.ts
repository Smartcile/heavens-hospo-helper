import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getWorkerSession, saveAvailability } = vi.hoisted(() => ({
  db: {
    venue: { findUnique: vi.fn() },
    staff: { findUnique: vi.fn() },
    staffAvailability: { findMany: vi.fn() },
  },
  getWorkerSession: vi.fn(),
  saveAvailability: vi.fn(),
}))

vi.mock('@/lib/worker-session', () => ({ getWorkerSession }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/availability.server', () => ({
  loadPendingRequests: vi.fn(),
  loadSeriesSummaries: vi.fn(),
  mapAvailabilityEntry: vi.fn((row: unknown) => row),
  parseRepeat: vi.fn(() => null),
  parseScope: vi.fn((raw: unknown) => raw ?? null),
  saveAvailability,
}))

import { GET, POST } from './route'
import { loadPendingRequests, loadSeriesSummaries } from '@/lib/availability.server'
import { keyOfDay, shiftDay } from '@/lib/date-nav'

function req(body: unknown): NextRequest {
  return { json: async () => body, nextUrl: new URL('http://localhost/api/worker/availability') } as unknown as NextRequest
}

const tomorrow = shiftDay(keyOfDay(new Date()), 1)
const payload = { date: tomorrow, availability: { isAllDay: true, type: 'AVAILABLE' }, scope: 'FROM', seriesId: 's1' }

beforeEach(() => {
  vi.clearAllMocks()
  getWorkerSession.mockResolvedValue({ staffId: 'st1', venueId: 'v1' })
  db.venue.findUnique.mockResolvedValue({ availabilityLockDays: 0, availabilityCutoff: null, timezone: 'Pacific/Auckland' })
  saveAvailability.mockResolvedValue({ mode: 'SAVED', plan: {}, skipped: [] })
})

describe('POST /api/worker/availability', () => {
  it('requires a worker session', async () => {
    getWorkerSession.mockResolvedValueOnce(null)

    const res = await POST(req(payload))
    expect(res.status).toBe(401)
    expect(saveAvailability).not.toHaveBeenCalled()
  })

  it('rejects an anchor in the past with a 400', async () => {
    const res = await POST(req({ ...payload, date: '2000-01-01' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'THAT DAY IS IN THE PAST' })
    expect(saveAvailability).not.toHaveBeenCalled()
  })

  it('passes FROM and the worker scope policy through', async () => {
    const res = await POST(req(payload))

    expect(res.status).toBe(200)
    expect(saveAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ staffId: 'st1', venueId: 'v1', dateKey: tomorrow, scope: 'FROM', seriesId: 's1' }),
      expect.objectContaining({ bypass: false, allowedScopes: ['THIS', 'FROM'] }),
    )
  })

  it('passes an UNCHANGED result through as a 200', async () => {
    saveAvailability.mockResolvedValueOnce({ mode: 'UNCHANGED', skipped: [] })

    const res = await POST(req(payload))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mode: 'UNCHANGED', requestId: null, skipped: [] })
  })

  it('returns target dates on each pending request', async () => {
    db.staff.findUnique.mockResolvedValue({ employmentType: 'CASUAL' })
    db.staffAvailability.findMany.mockResolvedValue([])
    vi.mocked(loadSeriesSummaries).mockResolvedValue([])
    vi.mocked(loadPendingRequests).mockResolvedValue([
      { id: 'r1', date: tomorrow, targetDates: [tomorrow, shiftDay(tomorrow, 7)] },
    ] as never)

    const res = await GET(req({}))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.requests[0].targetDates).toEqual([tomorrow, shiftDay(tomorrow, 7)])
  })
})
