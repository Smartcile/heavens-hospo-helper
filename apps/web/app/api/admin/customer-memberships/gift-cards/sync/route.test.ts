import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, syncGiftCardMembershipsForVenue } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  syncGiftCardMembershipsForVenue: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-memberships.server', () => ({ syncGiftCardMembershipsForVenue }))

import { POST } from './route'

const postReq = (body: unknown) =>
  ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  syncGiftCardMembershipsForVenue.mockResolvedValue({ synced: 4, failed: 0 })
})

describe('POST /api/admin/customer-memberships/gift-cards/sync', () => {
  it('backfills issued gift cards into the GIFT CARDS database', async () => {
    const res = await POST(postReq({ venueId: 'v1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.synced).toBe(4)
    expect(syncGiftCardMembershipsForVenue).toHaveBeenCalledWith('v1')
  })
})
