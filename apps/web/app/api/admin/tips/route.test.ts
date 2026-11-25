import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId, getManagerVenueId, getAccessibleVenueIds } =
  vi.hoisted(() => ({
    prisma: {
      tipsPeriod: { create: vi.fn(), findMany: vi.fn() },
      staff: { findMany: vi.fn() },
    },
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    resolveScopedVenueId: vi.fn(),
    getManagerVenueId: vi.fn(),
    getAccessibleVenueIds: vi.fn(),
  }))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId, getManagerVenueId, getAccessibleVenueIds }))

import { GET, POST } from './route'

const jsonReq = (body: unknown, url = 'http://localhost/api/admin/tips') =>
  ({ url, nextUrl: new URL(url), json: async () => body } as unknown as NextRequest)

const created = () => ({
  id: 'p1',
  venueId: 'v1',
  label: 'FEB',
  fromDate: new Date('2026-02-01T00:00:00.000Z'),
  toDate: new Date('2026-02-28T00:00:00.000Z'),
  cashCounts: {},
  posTotal: 0,
  notes: null,
  fullyIssuedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  shares: [
    {
      id: 'r1',
      staffId: 's1',
      name: 'ALEX CHEN',
      hours: 0,
      shareWeight: 1,
      sortOrder: 0,
      status: 'PLANNED',
      approvalNote: null,
      issueNote: null,
      approvedAt: null,
      issuedAt: null,
      deletedAt: null,
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  getManagerVenueId.mockReturnValue(null)
  getAccessibleVenueIds.mockReturnValue(['v1'])
  prisma.staff.findMany.mockResolvedValue([
    { id: 's1', firstName: 'ALEX', lastName: 'CHEN' },
    { id: 's2', firstName: 'SAM', lastName: 'WILSON' },
  ])
  prisma.tipsPeriod.create.mockResolvedValue(created())
  prisma.tipsPeriod.findMany.mockResolvedValue([created()])
})

describe('POST /api/admin/tips', () => {
  it('auto-adds every active staff member to a new period', async () => {
    const res = await POST(
      jsonReq({ fromDate: '2026-02-01', toDate: '2026-02-28', venueId: 'v1' }),
    )
    expect(res.status).toBe(201)
    const data = prisma.tipsPeriod.create.mock.calls[0][0].data
    expect(data.shares.create).toHaveLength(2)
    expect(data.shares.create[0]).toMatchObject({ staffId: 's1', name: 'ALEX CHEN', hours: 0, shareWeight: 1 })
    expect(data.legacyShares).toBeUndefined()
  })

  it('requires both dates', async () => {
    const res = await POST(jsonReq({ fromDate: '2026-02-01', venueId: 'v1' }))
    expect(res.status).toBe(400)
  })

  it('refuses a venue the session cannot use', async () => {
    resolveScopedVenueId.mockReturnValue({ error: 'FORBIDDEN' })
    const res = await POST(jsonReq({ fromDate: '2026-02-01', toDate: '2026-02-28', venueId: 'v2' }))
    expect(res.status).toBe(403)
    expect(prisma.tipsPeriod.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/admin/tips', () => {
  it('locks a manager to their effective venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'v1' } })
    getManagerVenueId.mockReturnValue('v1')
    const res = await GET(jsonReq(undefined, 'http://localhost/api/admin/tips?venueId=v2'))
    expect(res.status).toBe(200)
    expect(prisma.tipsPeriod.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1' }) }),
    )
  })

  it('rejects an inaccessible admin venue filter', async () => {
    getAccessibleVenueIds.mockReturnValue(['v1'])
    const res = await GET(jsonReq(undefined, 'http://localhost/api/admin/tips?venueId=v9'))
    expect(res.status).toBe(403)
  })
})
