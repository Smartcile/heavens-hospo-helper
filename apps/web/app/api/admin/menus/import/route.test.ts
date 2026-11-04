import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, tx, getServerSession, guardAccess, syncMenuItemCategory, pushProduct } = vi.hoisted(() => {
  const tx = {
    menu: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuGroup: { findFirst: vi.fn(), create: vi.fn() },
    menuItem: { findFirst: vi.fn(), create: vi.fn() },
    menuMenuItem: { findFirst: vi.fn(), create: vi.fn() },
  }
  return {
    db: { $transaction: vi.fn() },
    tx,
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
    syncMenuItemCategory: vi.fn(),
    pushProduct: vi.fn(),
  }
})

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))
vi.mock('@/lib/menu-sync', () => ({ syncMenuItemCategory }))
vi.mock('@/lib/woo-push', () => ({ pushProduct }))

import { POST } from './route'

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

const baseData = {
  name: 'DINNER',
  description: null,
  groups: [
    {
      name: 'MAINS',
      items: [
        { name: 'STEAK', price: 32.5, description: 'WITH CHIPS', dietary: ['MILK'] },
        { name: 'FISH', price: 28, description: null, dietary: [] },
      ],
    },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  getServerSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', venueId: 'v1', availableVenueIds: ['v1'] } })
  guardAccess.mockResolvedValue(null)
  db.$transaction.mockImplementation(async (cb: (client: typeof tx) => unknown) => cb(tx))
  tx.menu.findFirst.mockResolvedValue(null)
  tx.menu.create.mockResolvedValue({ id: 'm1', name: 'DINNER' })
  tx.menu.update.mockResolvedValue({ id: 'm1', name: 'DINNER' })
  tx.menuGroup.findFirst.mockResolvedValue(null)
  tx.menuGroup.create.mockResolvedValue({ id: 'g1', name: 'MAINS' })
  tx.menuMenuItem.findFirst.mockResolvedValue(null)
  tx.menuMenuItem.create.mockResolvedValue({ id: 'line1' })
})

describe('POST /api/admin/menus/import', () => {
  it('rejects an empty import', async () => {
    const res = await POST(req({ data: { name: 'X', groups: [] } }))
    expect(res.status).toBe(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('creates missing products and menu lines without touching WooCommerce', async () => {
    let seq = 0
    tx.menuItem.findFirst.mockResolvedValue(null)
    tx.menuItem.create.mockImplementation(async () => ({ id: `p${++seq}` }))

    const res = await POST(req({ venueId: 'v1', menuName: 'DINNER', data: baseData }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ menuId: 'm1', created: 2, matched: 0, skipped: 0 })
    expect(tx.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'STEAK', price: 32.5, recipeId: null, wooProductId: null, dietaryInfo: 'MILK' }),
      }),
    )
    expect(tx.menuMenuItem.create).toHaveBeenCalledTimes(2)
    expect(pushProduct).not.toHaveBeenCalled()
  })

  it('reuses an existing product and skips a line already on the menu', async () => {
    tx.menuItem.findFirst.mockResolvedValue({ id: 'p1', name: 'STEAK', price: 30 })
    tx.menuMenuItem.findFirst.mockResolvedValue({ id: 'existing-line' })

    const res = await POST(req({ venueId: 'v1', menuName: 'DINNER', data: baseData }))
    const json = await res.json()

    expect(json).toMatchObject({ created: 0, matched: 2, skipped: 2 })
    expect(tx.menuItem.create).not.toHaveBeenCalled()
    expect(tx.menuMenuItem.create).not.toHaveBeenCalled()
  })

  it('revives a soft-deleted menu with the same name', async () => {
    tx.menu.findFirst.mockResolvedValue({ id: 'm1', name: 'DINNER', deletedAt: new Date(), description: null })
    tx.menuItem.findFirst.mockResolvedValue({ id: 'p1', name: 'X' })

    const res = await POST(req({ venueId: 'v1', menuName: 'DINNER', data: baseData }))

    expect(res.status).toBe(200)
    expect(tx.menu.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' }, data: expect.objectContaining({ deletedAt: null }) }),
    )
    expect(tx.menu.create).not.toHaveBeenCalled()
  })
})
