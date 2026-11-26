import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, getServerSession, guardAccess, getManagerVenueId, getAccessibleVenueIds, loadHistory } = vi.hoisted(() => ({
  db: {
    venue: { findUnique: vi.fn() },
    staff: { findFirst: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  getAccessibleVenueIds: vi.fn(),
  loadHistory: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
// Keep the real scoped-venue resolver so the MANAGER lock is the production rule.
vi.mock('@/lib/venue-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/venue-scope')>()
  return { ...actual, getManagerVenueId, getAccessibleVenueIds }
})
vi.mock('@/lib/availability-history.server', () => ({
  HISTORY_DEFAULT_DAYS: 90,
  loadAvailabilityHistory: loadHistory,
}))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { GET } from './route'

const req = (query = '') => ({
  nextUrl: new URL(`http://localhost/api/admin/availability/history${query ? `?${query}` : ''}`),
  cookies: { get: () => undefined },
} as unknown as NextRequest)

const emptyHistory = {
  venueId: 'v1',
  today: '2026-11-26',
  timezone: 'Pacific/Auckland',
  from: '2026-08-29',
  to: '2026-11-26',
  staff: [],
  requests: [],
  days: [],
  truncated: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({
    user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] },
  })
  guardAccess.mockResolvedValue(null)
  getManagerVenueId.mockReturnValue('v1')
  getAccessibleVenueIds.mockReturnValue(['v1'])
  db.venue.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' })
  db.staff.findFirst.mockResolvedValue({ id: 'st1' })
  loadHistory.mockResolvedValue(emptyHistory)
})

describe('GET /api/admin/availability/history', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValueOnce(null)
    expect((await GET(req())).status).toBe(401)
  })

  it('guards on team.availability.view and returns its 403 untouched', async () => {
    guardAccess.mockResolvedValueOnce(new Response('no', { status: 403 }))
    const res = await GET(req())
    expect(res.status).toBe(403)
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('locks a MANAGER to their effective venue and ignores ?venueId', async () => {
    getServerSession.mockResolvedValueOnce({
      user: { id: 'u2', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] },
    })
    getManagerVenueId.mockReturnValue('v1')

    const res = await GET(req('venueId=v2&from=2026-10-01&to=2026-10-31'))

    expect(res.status).toBe(200)
    expect(loadHistory).toHaveBeenCalledWith(expect.objectContaining({ venueId: 'v1' }))
  })

  it('forbids an ADMIN asking for an inaccessible venue', async () => {
    const res = await GET(req('venueId=v9'))
    expect(res.status).toBe(403)
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('passes the status filter and includeDeleted through, and returns the venue-local today', async () => {
    const res = await GET(req('from=2026-10-01&to=2026-10-31&status=APPLIED&includeDeleted=0'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(loadHistory).toHaveBeenCalledWith(expect.objectContaining({
      venueId: 'v1',
      from: '2026-10-01',
      to: '2026-10-31',
      status: 'APPLIED',
      includeDeleted: false,
    }))
    expect(body.today).toBe('2026-11-26')
  })

  it('defaults to the last 90 days and includes soft-deleted history', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const args = loadHistory.mock.calls[0][0] as { from: string; to: string; includeDeleted: boolean }
    expect(args.includeDeleted).toBe(true)
    const span = (new Date(`${args.to}T00:00:00Z`).getTime() - new Date(`${args.from}T00:00:00Z`).getTime()) / 86_400_000
    expect(span).toBe(89)
  })

  it('rejects impossible dates and a backwards range', async () => {
    expect((await GET(req('from=2026-99-99'))).status).toBe(400)
    expect((await GET(req('from=2026-10-31&to=2026-10-01'))).status).toBe(400)
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('404s a staff member outside the venue', async () => {
    db.staff.findFirst.mockResolvedValueOnce(null)
    const res = await GET(req('staffId=st2&from=2026-10-01&to=2026-10-31'))
    expect(res.status).toBe(404)
    expect(loadHistory).not.toHaveBeenCalled()
  })

  it('accepts a departed staff member so their history stays filterable', async () => {
    db.staff.findFirst.mockResolvedValueOnce({ id: 'gone' })
    const res = await GET(req('staffId=gone&from=2026-10-01&to=2026-10-31'))

    expect(res.status).toBe(200)
    // Venue scope is the gate — a soft-deleted person is still in the venue.
    expect(db.staff.findFirst).toHaveBeenCalledWith({ where: { id: 'gone', venueId: 'v1' }, select: { id: true } })
    expect(loadHistory).toHaveBeenCalledWith(expect.objectContaining({ staffId: 'gone' }))
  })
})
