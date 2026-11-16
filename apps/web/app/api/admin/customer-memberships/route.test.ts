import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, resolveScopedVenueId, listMemberships, createMembership, membershipView } =
  vi.hoisted(() => ({
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    resolveScopedVenueId: vi.fn(),
    listMemberships: vi.fn(),
    createMembership: vi.fn(),
    membershipView: vi.fn((row: Record<string, unknown>) => ({ id: row.id, membershipNumber: row.membershipNumber })),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-memberships.server', () => ({
  listMemberships,
  createMembership,
  membershipView,
}))

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/customer-memberships') =>
  ({ url, nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) =>
  ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  listMemberships.mockResolvedValue([{ id: 'm1', membershipNumber: '101' }])
  createMembership.mockResolvedValue({ id: 'm2', membershipNumber: '102' })
})

describe('GET /api/admin/customer-memberships', () => {
  it('passes the venue, group, search and status filters', async () => {
    const res = await GET(
      getReq('http://localhost/api/admin/customer-memberships?groupId=g1&search=smith&status=inactive'),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.memberships[0].membershipNumber).toBe('101')
    expect(listMemberships).toHaveBeenCalledWith({
      venueId: 'v1',
      groupId: 'g1',
      search: 'smith',
      status: 'inactive',
    })
  })

  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(getReq())).status).toBe(401)
  })
})

describe('POST /api/admin/customer-memberships', () => {
  it('creates a manual member', async () => {
    const res = await POST(postReq({ groupId: 'g1', membershipNumber: '102', firstName: 'Jane', lastName: 'Smith' }))
    expect(res.status).toBe(201)
    expect(createMembership).toHaveBeenCalledWith(
      'v1',
      expect.objectContaining({ groupId: 'g1', membershipNumber: '102' }),
    )
  })

  it('requires a group and number', async () => {
    const res = await POST(postReq({ groupId: 'g1' }))
    expect(res.status).toBe(422)
  })
})
