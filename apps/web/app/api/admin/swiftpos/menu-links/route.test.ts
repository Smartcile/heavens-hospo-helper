import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { GET, PUT } from '@/app/api/admin/swiftpos/menu-links/route'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  fetchProducts: vi.fn(),
  prisma: {
    venue: { findUnique: vi.fn() },
    menuItem: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    staff: { findUnique: vi.fn() },
    staffPermission: { findUnique: vi.fn() },
  },
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/swiftpos.server', () => ({ fetchProducts: mocks.fetchProducts }))

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

function request(
  path: string,
  opts?: { method?: string; body?: unknown; cookies?: Record<string, string> },
): NextRequest {
  return {
    nextUrl: new URL(`http://localhost${path}`),
    cookies: {
      get: (name: string) =>
        opts?.cookies?.[name] ? { value: opts.cookies[name] } : undefined,
    },
    json: async () => opts?.body ?? null,
  } as unknown as NextRequest
}

const venue = (id: string) => ({
  id,
  name: `VENUE ${id}`,
  swiftPosBaseUrl: `http://swift-${id.toLowerCase()}:5080`,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.fetchProducts.mockResolvedValue({ rows: [], total: 0, truncated: false })
  mocks.prisma.staff.findUnique.mockResolvedValue({ restricted: true })
  mocks.prisma.staffPermission.findUnique.mockResolvedValue({ id: 'grant' })
  mocks.prisma.menuItem.findMany.mockResolvedValue([])
  mocks.prisma.venue.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(venue(where.id)),
  )
})

describe('GET /api/admin/swiftpos/menu-links venue scoping', () => {
  it('uses the active venue for a restricted manager, not the requested home venue', async () => {
    mocks.getServerSession.mockResolvedValue(session('MANAGER', 'A', ['A', 'B']))
    mocks.prisma.menuItem.findMany.mockResolvedValue([
      { id: 'mb', name: 'B ITEM', swiftPosId: null },
    ])

    const res = await GET(
      request('/api/admin/swiftpos/menu-links?venueId=A', {
        cookies: { 'admin-active-venue': 'B' },
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.venueId).toBe('B')
    expect(mocks.prisma.venue.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'B' } }),
    )
    expect(mocks.prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { venueId: 'B', deletedAt: null } }),
    )
    expect(mocks.fetchProducts).toHaveBeenCalledWith('http://swift-b:5080')
  })

  it('lets an admin read an accessible venue from the query string', async () => {
    mocks.getServerSession.mockResolvedValue(session('ADMIN', 'A', ['A', 'B']))

    const res = await GET(request('/api/admin/swiftpos/menu-links?venueId=B'))

    expect(res.status).toBe(200)
    expect((await res.json()).venueId).toBe('B')
  })

  it('refuses an admin venue that is not accessible', async () => {
    mocks.getServerSession.mockResolvedValue(session('ADMIN', 'A', ['A', 'B']))

    const res = await GET(request('/api/admin/swiftpos/menu-links?venueId=C'))

    expect(res.status).toBe(403)
    expect(mocks.prisma.venue.findUnique).not.toHaveBeenCalled()
  })
})

describe('PUT /api/admin/swiftpos/menu-links venue scoping', () => {
  it('writes a product in the manager active venue even when the body names home', async () => {
    mocks.getServerSession.mockResolvedValue(session('MANAGER', 'A', ['A', 'B']))
    mocks.prisma.menuItem.findFirst.mockResolvedValue({ id: 'mb', name: 'B ITEM', venueId: 'B' })
    mocks.prisma.menuItem.update.mockResolvedValue({ id: 'mb', name: 'B ITEM', swiftPosId: 'NEW' })

    const res = await PUT(
      request('/api/admin/swiftpos/menu-links', {
        method: 'PUT',
        cookies: { 'admin-active-venue': 'B' },
        body: { venueId: 'A', menuItemId: 'mb', swiftPosId: 'NEW' },
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.prisma.menuItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mb' }, data: { swiftPosId: 'NEW' } }),
    )
  })

  it('refuses a manager writing a product in the home venue while active elsewhere', async () => {
    mocks.getServerSession.mockResolvedValue(session('MANAGER', 'A', ['A', 'B']))
    mocks.prisma.menuItem.findFirst.mockResolvedValue({ id: 'ma', name: 'A ITEM', venueId: 'A' })

    const res = await PUT(
      request('/api/admin/swiftpos/menu-links', {
        method: 'PUT',
        cookies: { 'admin-active-venue': 'B' },
        body: { venueId: 'B', menuItemId: 'ma', swiftPosId: 'NEW' },
      }),
    )

    expect(res.status).toBe(403)
    expect(mocks.prisma.menuItem.update).not.toHaveBeenCalled()
  })

  it('refuses an admin cross-venue write', async () => {
    mocks.getServerSession.mockResolvedValue(session('ADMIN', 'A', ['A', 'B']))
    mocks.prisma.menuItem.findFirst.mockResolvedValue({ id: 'ma', name: 'A ITEM', venueId: 'A' })

    const res = await PUT(
      request('/api/admin/swiftpos/menu-links', {
        method: 'PUT',
        body: { venueId: 'B', menuItemId: 'ma', swiftPosId: 'NEW' },
      }),
    )

    expect(res.status).toBe(403)
    expect(mocks.prisma.menuItem.update).not.toHaveBeenCalled()
  })

  it('refuses an admin venue that is not accessible', async () => {
    mocks.getServerSession.mockResolvedValue(session('ADMIN', 'A', ['A', 'B']))
    mocks.prisma.menuItem.findFirst.mockResolvedValue({ id: 'mc', name: 'C ITEM', venueId: 'C' })

    const res = await PUT(
      request('/api/admin/swiftpos/menu-links', {
        method: 'PUT',
        body: { venueId: 'C', menuItemId: 'mc', swiftPosId: 'NEW' },
      }),
    )

    expect(res.status).toBe(403)
    expect(mocks.prisma.menuItem.update).not.toHaveBeenCalled()
  })
})
