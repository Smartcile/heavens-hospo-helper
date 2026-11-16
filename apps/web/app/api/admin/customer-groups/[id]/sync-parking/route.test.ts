import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, syncCustomerGroupToParking } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  syncCustomerGroupToParking: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-group-parking.server', () => ({ syncCustomerGroupToParking }))

import { POST } from './route'

const postReq = (body: unknown) =>
  ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  syncCustomerGroupToParking.mockResolvedValue({
    linked: true,
    parkingTypeId: 'p1',
    synced: 42,
    deactivated: 3,
    skipped: 0,
  })
})

describe('POST /api/admin/customer-groups/[id]/sync-parking', () => {
  it('syncs the linked group into the parking member list', async () => {
    const res = await POST(postReq({ venueId: 'v1' }), { params: { id: 'g1' } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.synced).toBe(42)
    expect(syncCustomerGroupToParking).toHaveBeenCalledWith('v1', 'g1')
  })
})
