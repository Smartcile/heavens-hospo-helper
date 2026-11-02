import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  venueUpdate: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({
  prisma: { venue: { update: mocks.venueUpdate } },
  Prisma: { DbNull: null },
}))

import { PUT } from './route'

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/venues/venue-1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: { id: 'venue-1' } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getServerSession.mockResolvedValue({
    user: { role: 'ADMIN', venueId: 'venue-1', availableVenueIds: [] },
  })
  mocks.venueUpdate.mockResolvedValue({ id: 'venue-1', workerSessionTimeoutMinutes: 15 })
})

describe('PUT /api/admin/venues/[id] — worker session timeout', () => {
  it('returns 400 for a non-numeric timeout instead of coercing it', async () => {
    const res = await PUT(request({ workerSessionTimeoutMinutes: 'abc' }), params)
    expect(res.status).toBe(400)
    expect(mocks.venueUpdate).not.toHaveBeenCalled()
  })

  it('clamps a negative value to the 5-minute minimum', async () => {
    const res = await PUT(request({ workerSessionTimeoutMinutes: -10 }), params)
    expect(res.status).toBe(200)
    expect(mocks.venueUpdate).toHaveBeenCalledWith({
      where: { id: 'venue-1' },
      data: { workerSessionTimeoutMinutes: 5 },
    })
  })

  it('maps blank and 0 to null (server fallback)', async () => {
    await PUT(request({ workerSessionTimeoutMinutes: 0 }), params)
    expect(mocks.venueUpdate).toHaveBeenLastCalledWith({
      where: { id: 'venue-1' },
      data: { workerSessionTimeoutMinutes: null },
    })

    await PUT(request({ workerSessionTimeoutMinutes: '' }), params)
    expect(mocks.venueUpdate).toHaveBeenLastCalledWith({
      where: { id: 'venue-1' },
      data: { workerSessionTimeoutMinutes: null },
    })
  })
})
