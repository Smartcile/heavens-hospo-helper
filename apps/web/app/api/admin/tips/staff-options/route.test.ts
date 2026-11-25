import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId } = vi.hoisted(() => ({
  prisma: { staff: { findMany: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))

import { GET } from './route'

const req = (url = 'http://localhost/api/admin/tips/staff-options') =>
  ({ nextUrl: new URL(url) } as unknown as NextRequest)

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.staff.findMany.mockResolvedValue([
    { id: 's1', firstName: 'ALEX', lastName: 'CHEN', department: { name: 'BOH' } },
  ])
})

describe('GET /api/admin/tips/staff-options', () => {
  it('requires the tips view grant', async () => {
    guardAccess.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(req())).status).toBe(403)
  })

  it('returns active staff for the scoped venue only', async () => {
    const res = await GET(req('http://localhost/api/admin/tips/staff-options?venueId=v1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: 's1', name: 'ALEX CHEN', departmentName: 'BOH' },
    ])
    expect(prisma.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ venueId: 'v1', isActive: true }) }),
    )
  })

  it('refuses an inaccessible venue', async () => {
    resolveScopedVenueId.mockReturnValue({ error: 'FORBIDDEN' })
    expect((await GET(req('http://localhost/api/admin/tips/staff-options?venueId=v9'))).status).toBe(403)
    expect(prisma.staff.findMany).not.toHaveBeenCalled()
  })
})
