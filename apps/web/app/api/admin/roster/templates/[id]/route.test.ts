import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, resolveScopedVenueId } = vi.hoisted(() => ({
  prisma: { rosterTemplate: { findUnique: vi.fn(), update: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  resolveScopedVenueId: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/venue-scope', () => ({ resolveScopedVenueId }))

import { DELETE } from './route'

const req = (() => ({ nextUrl: new URL('http://localhost') })) as unknown as NextRequest
const params = { params: { id: 't1' } }

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
  guardAccess.mockResolvedValue(null)
  resolveScopedVenueId.mockReturnValue({ venueId: 'v1' })
  prisma.rosterTemplate.findUnique.mockResolvedValue({ id: 't1', venueId: 'v1', deletedAt: null })
  prisma.rosterTemplate.update.mockResolvedValue({})
})

describe('DELETE /api/admin/roster/templates/[id]', () => {
  it('returns 401 without a session', async () => {
    getServerSession.mockResolvedValue(null)
    expect((await DELETE(req, params)).status).toBe(401)
  })

  it('404s an unknown template', async () => {
    prisma.rosterTemplate.findUnique.mockResolvedValue(null)
    expect((await DELETE(req, params)).status).toBe(404)
  })

  it('refuses a template from another venue', async () => {
    resolveScopedVenueId.mockReturnValue({ venueId: 'v2' })
    expect((await DELETE(req, params)).status).toBe(403)
    expect(prisma.rosterTemplate.update).not.toHaveBeenCalled()
  })

  it('soft-deletes the template', async () => {
    const res = await DELETE(req, params)
    expect(res.status).toBe(200)
    expect(prisma.rosterTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { deletedAt: expect.any(Date) },
    })
  })
})
