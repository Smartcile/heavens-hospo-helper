import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId, customerGroupView } = vi.hoisted(() => ({
  prisma: {
    customerGroup: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  customerGroupView: vi.fn((group: Record<string, unknown>) => ({ id: group.id, name: group.name })),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@/lib/customer-groups.server', () => ({ customerGroupInclude: {}, customerGroupView }))

import { GET, PUT } from './route'

const getReq = (url = 'http://localhost/api/admin/swiftpos/members') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)
const putReq = (body: unknown) =>
  ({ json: async () => body, nextUrl: new URL('http://localhost') } as unknown as NextRequest)

const group = {
  id: 'g1',
  venueId: 'v1',
  name: 'RAYC MEMBERS',
  swiftPosTypeActive: 3,
  swiftPosStatusActive: 1,
  swiftPosTypeRemoved: 9,
  swiftPosStatusRemoved: 0,
  exportEncoding: 'UTF8_BOM',
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.customerGroup.findMany.mockResolvedValue([group])
  prisma.customerGroup.findFirst.mockResolvedValue(group)
  prisma.customerGroup.update.mockResolvedValue(group)
})

describe('GET /api/admin/swiftpos/members', () => {
  it('lists the venue databases', async () => {
    const res = await GET(getReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.groups[0].id).toBe('g1')
  })
})

describe('PUT /api/admin/swiftpos/members', () => {
  it('saves the active/removed mapping', async () => {
    const res = await PUT(
      putReq({
        venueId: 'v1',
        groupId: 'g1',
        swiftPosTypeActive: 4,
        swiftPosStatusActive: 1,
        swiftPosTypeRemoved: 10,
        swiftPosStatusRemoved: 0,
        exportEncoding: 'UTF8',
      }),
    )
    expect(res.status).toBe(200)
    expect(prisma.customerGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          swiftPosTypeActive: 4,
          swiftPosTypeRemoved: 10,
          exportEncoding: 'UTF8',
        }),
      }),
    )
  })

  it('404s for a group outside the venue', async () => {
    prisma.customerGroup.findFirst.mockResolvedValue(null)
    const res = await PUT(putReq({ venueId: 'v1', groupId: 'other' }))
    expect(res.status).toBe(404)
  })
})
