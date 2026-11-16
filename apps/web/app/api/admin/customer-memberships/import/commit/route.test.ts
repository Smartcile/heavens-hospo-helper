import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, commitMemberImport } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  commitMemberImport: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-memberships.server', () => ({ commitMemberImport }))

import { POST } from './route'

const postReq = (body: unknown) =>
  ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  commitMemberImport.mockResolvedValue({ created: 2, updated: 1, total: 3, issues: [] })
})

describe('POST /api/admin/customer-memberships/import/commit', () => {
  it('hands the reviewed rows to the server importer', async () => {
    const rows = [{ id: 'r2', baseNumber: '101', include: true }]
    const res = await POST(postReq({ venueId: 'v1', groupId: 'g1', rows }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.created).toBe(2)
    expect(commitMemberImport).toHaveBeenCalledWith({ venueId: 'v1', groupId: 'g1', rows })
  })

  it('rejects an empty import', async () => {
    const res = await POST(postReq({ venueId: 'v1', groupId: 'g1', rows: [] }))
    expect(res.status).toBe(422)
  })
})
