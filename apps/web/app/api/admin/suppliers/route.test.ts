import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: { supplier: { findMany: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET } from './route'

const request = (venueId?: string) =>
  new NextRequest(`http://localhost/api/admin/suppliers${venueId ? `?venueId=${venueId}` : ''}`)

describe('/api/admin/suppliers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1' } })
    guardAccess.mockResolvedValue(null)
    prisma.supplier.findMany.mockResolvedValue([
      {
        id: 's1',
        name: 'BIDFOOD',
        venueId: 'v1',
        dropOffGuide: { id: 'g1', title: 'BIDFOOD DROP-OFF', status: 'PUBLISHED', guideType: 'SUPPLIER_INFO', deletedAt: null },
      },
      {
        id: 's2',
        name: 'OLD SUPPLIER',
        venueId: 'v1',
        dropOffGuide: { id: 'g2', title: 'DELETED GUIDE', status: 'PUBLISHED', guideType: 'SUPPLIER_INFO', deletedAt: new Date() },
      },
      {
        id: 's4',
        name: 'RE-TYPED SUPPLIER',
        venueId: 'v1',
        dropOffGuide: { id: 'g4', title: 'NOW A HOW TO', status: 'PUBLISHED', guideType: 'HOW_TO', deletedAt: null },
      },
      { id: 's3', name: 'NO GUIDE', venueId: 'v1', dropOffGuide: null },
    ])
  })

  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)

    const res = await GET(request())

    expect(res.status).toBe(401)
    expect(prisma.supplier.findMany).not.toHaveBeenCalled()
  })

  it('requires the inventory view grant', async () => {
    guardAccess.mockResolvedValue(new Response('Forbidden', { status: 403 }))

    const res = await GET(request())

    expect(res.status).toBe(403)
    expect(prisma.supplier.findMany).not.toHaveBeenCalled()
  })

  it('returns the live drop-off guide and hides a soft-deleted or re-typed one', async () => {
    const res = await GET(request())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: 'v1', deletedAt: null },
        include: expect.objectContaining({ dropOffGuide: expect.any(Object) }),
      }),
    )
    expect(body[0].dropOffGuide).toEqual({
      id: 'g1',
      title: 'BIDFOOD DROP-OFF',
      status: 'PUBLISHED',
      guideType: 'SUPPLIER_INFO',
    })
    expect(body[1].dropOffGuide).toBeNull()
    expect(body[2].dropOffGuide).toBeNull()
    expect(body[3].dropOffGuide).toBeNull()
  })

  it('locks a manager to their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'MANAGER', venueId: 'v-manager' } })

    await GET(request('v-other'))

    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { venueId: 'v-manager', deletedAt: null } }),
    )
  })
})
