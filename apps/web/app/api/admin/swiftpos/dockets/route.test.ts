import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET } from '@/app/api/admin/swiftpos/dockets/route'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  fetchKitchenDockets: vi.fn(),
  prisma: {
    venue: { findUnique: vi.fn() },
    staff: { findUnique: vi.fn() },
    staffPermission: { findUnique: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/swiftpos.server', () => ({
  fetchKitchenDockets: mocks.fetchKitchenDockets,
}))

function session(role: 'ADMIN' | 'MANAGER', homeVenueId: string, availableVenueIds: string[]) {
  return {
    user: {
      id: 'staff-1',
      role,
      venueId: homeVenueId,
      availableVenueIds,
    },
  }
}

function request(path: string, cookies?: Record<string, string>): NextRequest {
  return {
    nextUrl: new URL(`http://localhost${path}`),
    cookies: {
      get: (name: string) => (cookies?.[name] ? { value: cookies[name] } : undefined),
    },
    json: async () => null,
  } as unknown as NextRequest
}

const venue = (id: string) => ({
  id,
  name: `VENUE ${id}`,
  swiftPosBaseUrl: `http://swift-${id.toLowerCase()}:5080`,
  timezone: 'Pacific/Auckland',
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchKitchenDockets.mockResolvedValue([])
  mocks.prisma.staff.findUnique.mockResolvedValue({ restricted: true })
  mocks.prisma.staffPermission.findUnique.mockResolvedValue({ id: 'grant' })
  mocks.prisma.venue.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(venue(where.id)),
  )
})

describe('GET /api/admin/swiftpos/dockets venue scoping', () => {
  it('uses the manager active venue, not their home venue', async () => {
    mocks.getServerSession.mockResolvedValue(session('MANAGER', 'A', ['A', 'B']))

    const res = await GET(
      request('/api/admin/swiftpos/dockets?venueId=A&minutes=30', {
        'admin-active-venue': 'B',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.venueId).toBe('B')
    expect(mocks.prisma.venue.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'B' } }),
    )
    expect(mocks.fetchKitchenDockets).toHaveBeenCalledWith(
      'http://swift-b:5080',
      expect.any(String),
      expect.any(String),
    )
  })

  it('lets an admin read an accessible venue', async () => {
    mocks.getServerSession.mockResolvedValue(session('ADMIN', 'A', ['A', 'B']))

    const res = await GET(request('/api/admin/swiftpos/dockets?venueId=B'))

    expect(res.status).toBe(200)
    expect((await res.json()).venueId).toBe('B')
  })

  it('refuses an admin venue that is not accessible', async () => {
    mocks.getServerSession.mockResolvedValue(session('ADMIN', 'A', ['A', 'B']))

    const res = await GET(request('/api/admin/swiftpos/dockets?venueId=C'))

    expect(res.status).toBe(403)
    expect(mocks.prisma.venue.findUnique).not.toHaveBeenCalled()
    expect(mocks.fetchKitchenDockets).not.toHaveBeenCalled()
  })
})
