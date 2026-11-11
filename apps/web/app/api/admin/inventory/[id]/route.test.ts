import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { prisma, getServerSession, guardAccess, findInventoryBlockers } = vi.hoisted(() => ({
  prisma: {
    inventoryItem: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  getServerSession: vi.fn(),
  guardAccess: vi.fn(),
  findInventoryBlockers: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@hospo-ops/db', () => ({ prisma }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@/lib/inventory-usage.server', () => ({ findInventoryBlockers }))

import { DELETE } from './route'

const SESSION = { user: { id: 'st1', role: 'ADMIN', venueId: 'v1' } }

function deleteReq(permanent = false) {
  return new NextRequest(
    `http://localhost/api/admin/inventory/i1${permanent ? '?permanent=1' : ''}`,
    { method: 'DELETE' },
  )
}

const params = { params: { id: 'i1' } }

describe('/api/admin/inventory/[id] DELETE — in-use protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerSession.mockResolvedValue(SESSION)
    guardAccess.mockResolvedValue(null)
    prisma.inventoryItem.findFirst.mockResolvedValue({ id: 'i1', venueId: 'v1' })
    prisma.inventoryItem.update.mockResolvedValue({ id: 'i1', deletedAt: new Date() })
    prisma.inventoryItem.delete.mockResolvedValue({ id: 'i1' })
    findInventoryBlockers.mockResolvedValue([])
  })

  it('soft-deletes an item with no references', async () => {
    const res = await DELETE(deleteReq(), params)

    expect(res.status).toBe(200)
    expect(findInventoryBlockers).toHaveBeenCalledWith('i1', { includeDeletedParents: false })
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { deletedAt: expect.any(Date) },
    })
    expect(prisma.inventoryItem.delete).not.toHaveBeenCalled()
  })

  it('returns 409 with structured blockers instead of deleting', async () => {
    findInventoryBlockers.mockResolvedValue([
      { kind: 'RECIPE', count: 2, label: 'Used in 2 recipes', href: '/admin/ops?tab=inventory&sub=recipes' },
      { kind: 'STOCKTAKE', count: 1, label: 'Counted in a stocktake', href: '/admin/ops?tab=inventory&sub=stocktake' },
    ])

    const res = await DELETE(deleteReq(), params)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body).toEqual({
      error: 'IN USE',
      blockers: [
        { kind: 'RECIPE', count: 2, label: 'Used in 2 recipes', href: '/admin/ops?tab=inventory&sub=recipes' },
        { kind: 'STOCKTAKE', count: 1, label: 'Counted in a stocktake', href: '/admin/ops?tab=inventory&sub=stocktake' },
      ],
    })
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
    expect(prisma.inventoryItem.delete).not.toHaveBeenCalled()
  })

  it('also protects the permanent-purge path', async () => {
    findInventoryBlockers.mockResolvedValue([
      { kind: 'FLOOR_PLAN_ELEMENT', count: 1, label: 'Used on a floor plan element', href: '/admin/events?tab=rooms' },
    ])

    const res = await DELETE(deleteReq(true), params)

    expect(res.status).toBe(409)
    expect(prisma.inventoryItem.delete).not.toHaveBeenCalled()
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
  })

  it('allows a soft delete but blocks a purge when only a soft-deleted parent references it', async () => {
    findInventoryBlockers.mockImplementation(
      async (_id: string, options?: { includeDeletedParents?: boolean }) =>
        options?.includeDeletedParents
          ? [{ kind: 'SUPPLIER_CODE', count: 1, label: 'Has a supplier code', href: '/admin/settings?tab=suppliers' }]
          : [],
    )

    const soft = await DELETE(deleteReq(), params)
    expect(soft.status).toBe(200)
    expect(findInventoryBlockers).toHaveBeenCalledWith('i1', { includeDeletedParents: false })

    const purge = await DELETE(deleteReq(true), params)
    expect(purge.status).toBe(409)
    expect(findInventoryBlockers).toHaveBeenCalledWith('i1', { includeDeletedParents: true })
    expect(prisma.inventoryItem.delete).not.toHaveBeenCalled()
  })

  it('purges a deleted item when nothing references it', async () => {
    const res = await DELETE(deleteReq(true), params)

    expect(res.status).toBe(200)
    expect(prisma.inventoryItem.delete).toHaveBeenCalledWith({ where: { id: 'i1' } })
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
  })

  it('finds the item without a deletedAt filter so a soft-deleted row can be purged', async () => {
    await DELETE(deleteReq(true), params)

    expect(prisma.inventoryItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'i1' },
      select: { id: true, venueId: true },
    })
  })

  it('refuses a manager deleting another venue’s item before checking usage', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'st1', role: 'MANAGER', venueId: 'v2' } })

    const res = await DELETE(deleteReq(), params)

    expect(res.status).toBe(403)
    expect(findInventoryBlockers).not.toHaveBeenCalled()
    expect(prisma.inventoryItem.update).not.toHaveBeenCalled()
  })

  it('lets a manager delete an item in their own venue', async () => {
    getServerSession.mockResolvedValue({ user: { id: 'st1', role: 'MANAGER', venueId: 'v1' } })

    const res = await DELETE(deleteReq(), params)

    expect(res.status).toBe(200)
    expect(prisma.inventoryItem.update).toHaveBeenCalled()
  })

  it('returns 404 when the item does not exist', async () => {
    prisma.inventoryItem.findFirst.mockResolvedValue(null)

    const res = await DELETE(deleteReq(), params)

    expect(res.status).toBe(404)
    expect(findInventoryBlockers).not.toHaveBeenCalled()
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
