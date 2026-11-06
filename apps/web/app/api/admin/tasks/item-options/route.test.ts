import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess } = vi.hoisted(() => ({
  prisma: { inventoryItem: { findMany: vi.fn() } },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))

import { GET } from './route'

const request = (venueId = 'v1') =>
  new NextRequest(`http://localhost/api/admin/tasks/item-options?venueId=${venueId}`)

describe('/api/admin/tasks/item-options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue({ user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } })
    guardAccess.mockResolvedValue(null)
    prisma.inventoryItem.findMany.mockResolvedValue([])
  })

  it('requires a session', async () => {
    getServerSession.mockResolvedValue(null)

    const res = await GET(request())

    expect(res.status).toBe(401)
    expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled()
  })

  it('requires the tasks view grant', async () => {
    guardAccess.mockResolvedValue(new Response('Forbidden', { status: 403 }))

    const res = await GET(request())

    expect(res.status).toBe(403)
    expect(prisma.inventoryItem.findMany).not.toHaveBeenCalled()
  })

  it('locks a manager to their own venue and only returns active items', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'st1', role: 'MANAGER', venueId: 'v-manager' } })

    const res = await GET(request('v-other'))

    expect(res.status).toBe(200)
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: 'v-manager', deletedAt: null, isActive: true },
      }),
    )
  })

  it('uses the requested venue for an admin and excludes deleted locations', async () => {
    const res = await GET(request('v2'))

    expect(res.status).toBe(200)
    expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { venueId: 'v2', deletedAt: null, isActive: true },
        select: expect.objectContaining({
          storageLocations: expect.objectContaining({ where: { deletedAt: null } }),
        }),
      }),
    )
  })
})
