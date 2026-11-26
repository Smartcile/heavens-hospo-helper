import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerSession, guardAccess, canAccess, resolveScopedVenueId, prisma } = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  canAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
  prisma: { breachNotice: { findMany: vi.fn() } },
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess, canAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))
vi.mock('@hospo-ops/db', () => ({ prisma }))

import { GET } from './route'

const req = new NextRequest('http://localhost/api/admin/breach-notices?venueId=v1')

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'm1', role: 'MANAGER', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  canAccess.mockResolvedValue(true)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.breachNotice.findMany.mockResolvedValue([
    {
      id: 'n1',
      numberplate: 'ABC123',
      subjectType: 'STAFF',
      status: 'SUBMITTED',
      submittedBy: { firstName: 'Alex', lastName: 'Smith' },
      subjectStaff: { firstName: 'Alex', lastName: 'Smith' },
      reviewedBy: null,
    },
  ])
})

describe('GET /api/admin/breach-notices', () => {
  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await GET(req)).status).toBe(401)
  })

  it('returns the guard denial', async () => {
    const { NextResponse } = await import('next/server')
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(req)).status).toBe(403)
  })

  it('locks a manager to the scoped venue and returns names', async () => {
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(prisma.breachNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1', deletedAt: null }) }),
    )
    const body = await res.json()
    expect(body.items[0].submittedByName).toBe('Alex Smith')
    expect(body.canReview).toBe(true)
  })

  it('rejects a venue the scoped resolver refuses', async () => {
    resolveScopedVenueId.mockReturnValue({ error: 'FORBIDDEN' })
    expect((await GET(req)).status).toBe(403)
  })
})
