import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, loadParkingMetrics } = vi.hoisted(
  () => ({
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    resolveScopedVenueId: vi.fn(),
    loadParkingMetrics: vi.fn(),
  }),
)

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/parking-metrics.server', () => ({ loadParkingMetrics }))

import { GET } from './route'

const SESSION = { user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } }

function get(query = '') {
  return new NextRequest(`http://localhost/api/admin/parking/metrics${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue(SESSION)
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  loadParkingMetrics.mockResolvedValue({
    metrics: { plateEntries: 0 },
    range: { from: null, to: '2026-11-12T00:00:00.000Z', timezone: 'Pacific/Auckland' },
  })
})

describe('GET /api/admin/parking/metrics', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(get())).status).toBe(401)
  })

  it('guards the parking view permission', async () => {
    guardAccess.mockResolvedValue(new Response(null, { status: 403 }))
    expect((await GET(get())).status).toBe(403)
  })

  it('defaults to the last 30 days', async () => {
    const res = await GET(get())
    expect(res.status).toBe(200)
    expect(loadParkingMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: 'v1', from: expect.any(Date) }),
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('passes a null from for all time', async () => {
    await GET(get('?range=all'))
    expect(loadParkingMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: 'v1', from: null }),
    )
  })

  it('falls back to 30 days for an unknown range', async () => {
    await GET(get('?range=nope'))
    const args = loadParkingMetrics.mock.calls[0][0]
    expect(args.from).toBeInstanceOf(Date)
  })
})
