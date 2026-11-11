import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, getManagerVenueId, findInventoryBlockers } = vi.hoisted(() => ({
  prisma: {
    inventoryItem: { findFirst: vi.fn(), update: vi.fn() },
    setupItem: { count: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  getManagerVenueId: vi.fn(),
  findInventoryBlockers: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/venue-scope', () => ({ getManagerVenueId }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/furniture-server', () => ({
  furnitureInclude: {},
  toFurnitureView: vi.fn(),
  placedCounts: vi.fn(),
  normaliseShape: vi.fn(),
  parseVertices: vi.fn(),
  parseTableNumbers: vi.fn(),
  jsonOrNull: vi.fn(),
  isFurnitureType: vi.fn(),
  writeBom: vi.fn(),
}))
vi.mock('@/lib/inventory-usage.server', () => ({ findInventoryBlockers }))

import { DELETE } from './route'

const SESSION = { user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } }
const params = { params: { id: 'f1' } }

function deleteReq() {
  return new NextRequest('http://localhost/api/admin/furniture/f1', { method: 'DELETE' })
}

describe('/api/admin/furniture/[id] DELETE — in-use protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValue(null)
    getManagerVenueId.mockReturnValue(null)
    prisma.inventoryItem.findFirst.mockResolvedValue({ id: 'f1', venueId: 'v1' })
    prisma.inventoryItem.update.mockResolvedValue({ id: 'f1', deletedAt: new Date() })
    findInventoryBlockers.mockResolvedValue([])
  })

  it('still blocks furniture that is placed on a table plan (FLOOR_PLAN_SETUP)', async () => {
    findInventoryBlockers.mockResolvedValue([
      { kind: 'FLOOR_PLAN_SETUP', count: 1, label: 'Placed in a floor plan setup', href: '/admin/events?tab=rooms' },
    ])

    const res = await DELETE(deleteReq(), params)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({
      error: 'IN USE',
      blockers: [
        { kind: 'FLOOR_PLAN_SETUP', count: 1, label: 'Placed in a floor plan setup', href: '/admin/events?tab=rooms' },
      ],
    })
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
  })

  it('blocks furniture referenced by a recipe with the same 409 shape', async () => {
    findInventoryBlockers.mockResolvedValue([
      { kind: 'RECIPE', count: 2, label: 'Used in 2 recipes', href: '/admin/ops?tab=inventory&sub=recipes' },
    ])

    const res = await DELETE(deleteReq(), params)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('IN USE')
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
  })

  it('soft-deletes furniture when nothing references it', async () => {
    const res = await DELETE(deleteReq(), params)

    expect(res.status).toBe(200)
    expect(findInventoryBlockers).toHaveBeenCalledWith('f1')
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'f1' },
      data: { deletedAt: expect.any(Date) },
    })
  })

  it('scopes the lookup to the manager’s venue', async () => {
    getManagerVenueId.mockReturnValue('v2')

    await DELETE(deleteReq(), params)

    expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'f1', deletedAt: null, venueId: 'v2' },
      include: {},
    })
  })

  it('returns 404 when the furniture does not exist in scope', async () => {
    prisma.inventoryItem.findFirst.mockResolvedValue(null)

    const res = await DELETE(deleteReq(), params)

    expect(res.status).toBe(404)
    expect(findInventoryBlockers).not.toHaveBeenCalled()
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
  })

  it('returns 401 without a session and 403 when access is denied', async () => {
    getServerSession.mockResolvedValueOnce(null)
    expect((await DELETE(deleteReq(), params)).status).toBe(401)

    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValueOnce(new Response(null, { status: 403 }))
    expect((await DELETE(deleteReq(), params)).status).toBe(403)
    expect(prisma.inventoryItem.findFirst).not.toHaveBeenCalled()
  })
})
