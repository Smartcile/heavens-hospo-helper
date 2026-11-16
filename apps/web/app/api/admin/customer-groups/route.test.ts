import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId, customerGroupView } = vi.hoisted(() => ({
  prisma: {
    customerGroup: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  customerGroupView: vi.fn((group: Record<string, unknown>) => ({
    id: group.id,
    name: group.name,
    areas: Array.isArray(group.areas)
      ? (group.areas as { area: string }[]).map((a) => a.area)
      : [],
  })),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-groups.server', () => ({ customerGroupInclude: {}, customerGroupView }))

import { GET, POST } from './route'

const getReq = (url = 'http://localhost/api/admin/customer-groups') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)
const postReq = (body: unknown) =>
  ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

const group = {
  id: 'g1',
  venueId: 'v1',
  name: 'RAYC MEMBERS',
  slug: 'rayc-members',
  kind: 'MEMBER_DATABASE',
  areas: [{ area: 'CUSTOMERS' }, { area: 'BOOKINGS' }],
  _count: { memberships: 3 },
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.customerGroup.findMany.mockResolvedValue([group])
  prisma.customerGroup.findFirst.mockResolvedValue(null)
  prisma.customerGroup.create.mockResolvedValue(group)
})

describe('GET /api/admin/customer-groups', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(getReq())).status).toBe(401)
  })

  it('returns the guard response unchanged', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(getReq())).status).toBe(403)
  })

  it('lists the venue databases', async () => {
    const res = await GET(getReq())
    const body = await res.json()
    expect(body.groups[0].name).toBe('RAYC MEMBERS')
    expect(prisma.customerGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1', deletedAt: null }) }),
    )
  })
})

describe('POST /api/admin/customer-groups', () => {
  it('creates a database with its areas', async () => {
    const res = await POST(postReq({ name: 'Yacht Club', areas: ['CUSTOMERS', 'PARKING'] }))
    expect(res.status).toBe(201)
    expect(prisma.customerGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: 'v1',
          name: 'YACHT CLUB',
          slug: 'yacht-club',
        }),
      }),
    )
  })

  it('rejects a blank name', async () => {
    const res = await POST(postReq({ name: ' ' }))
    expect(res.status).toBe(422)
  })

  it('rejects a duplicate slug', async () => {
    prisma.customerGroup.findFirst.mockResolvedValue({ id: 'g1', deletedAt: null })
    const res = await POST(postReq({ name: 'Yacht Club' }))
    expect(res.status).toBe(409)
  })
})
