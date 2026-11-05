import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, tx, getServerSession, guardAccess } = vi.hoisted(() => {
  const tx = {
    menu: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuGroup: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuItem: { findMany: vi.fn(), create: vi.fn() },
    menuMenuItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  return {
    db: { $transaction: vi.fn() },
    tx,
    getServerSession: vi.fn(),
    guardAccess: vi.fn(),
  }
})

vi.mock('next-auth', () => ({ getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/permissions', () => ({ guardAccess }))
vi.mock('@hospo-ops/db', () => ({ prisma: db }))

import { POST } from './route'

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

const baseData = {
  name: 'dinner',
  description: null,
  groups: [
    {
      name: 'mains',
      area: 'restaurant',
      items: [
        {
          name: 'fish   and chips',
          price: 24.5,
          description: 'battered',
          // Dietary must NEVER be written to a product by the import.
          dietary: ['MILK'],
          sizes: [{ label: 'one size', price: 24.5 }],
          options: [{ name: 'side', choices: [{ name: 'fries', priceDelta: 0 }] }],
        },
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
  tx.menuGroup.findMany.mockResolvedValue([])
  tx.menuGroup.create.mockResolvedValue({ id: 'g1', name: 'MAINS', sortOrder: 0 })
  tx.menuGroup.update.mockResolvedValue({ id: 'g1', name: 'MAINS', sortOrder: 0 })
  tx.menuItem.findMany.mockResolvedValue([])
  tx.menuItem.create.mockResolvedValue({ id: 'p1', name: 'FISH AND CHIPS' })
  tx.menuMenuItem.findFirst.mockResolvedValue(null)
  tx.menuMenuItem.create.mockResolvedValue({ id: 'line1' })
  tx.menuMenuItem.update.mockResolvedValue({ id: 'line1' })
})

describe('POST /api/admin/menus/import', () => {
  it('rejects an empty import', async () => {
    const res = await POST(req({ data: { name: 'X', groups: [] } }))
    expect(res.status).toBe(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('creates products and lines without writing dietary, and maps sizes to variations', async () => {
    const res = await POST(req({ venueId: 'v1', menuName: 'DINNER', data: baseData }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({
      menuId: 'm1',
      created: 1,
      matched: 0,
      linesAdded: 1,
      linesUpdated: 0,
      skipped: 0,
      warnings: ['DIETARY NOT IMPORTED — ALLERGENS COME FROM THE PRODUCT'],
    })
    expect(tx.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          venueId: 'v1',
          name: 'FISH AND CHIPS',
          price: 24.5,
          description: 'battered',
          dietaryInfo: null,
          recipeId: null,
          wooProductId: null,
          isVariable: true,
          variations: [{ name: 'ONE SIZE', price: 24.5 }],
        }),
      }),
    )
    // No allergen string was written.
    const productData = tx.menuItem.create.mock.calls[0][0].data
    expect(JSON.stringify(productData)).not.toContain('MILK')
    expect(tx.menuMenuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ menuId: 'm1', menuItemId: 'p1', groupId: 'g1', sortOrder: 0 }),
      }),
    )
  })

  it('re-imports idempotently by normalised name and re-files the existing line', async () => {
    tx.menu.findFirst.mockResolvedValue({ id: 'm1', name: 'DINNER', deletedAt: null })
    tx.menuItem.findMany.mockResolvedValue([{ id: 'p1', name: 'FISH   AND CHIPS' }])
    tx.menuGroup.findMany.mockResolvedValue([{ id: 'g1', name: 'MAINS', sortOrder: 0 }])
    tx.menuMenuItem.findFirst.mockResolvedValue({ id: 'l1', groupId: 'old-group', sortOrder: 9 })

    const res = await POST(req({ venueId: 'v1', menuName: 'DINNER', data: baseData }))
    const json = await res.json()

    expect(json).toMatchObject({ created: 0, matched: 1, linesAdded: 0, linesUpdated: 1, skipped: 0 })
    expect(tx.menuItem.create).not.toHaveBeenCalled()
    expect(tx.menuGroup.create).not.toHaveBeenCalled()
    expect(tx.menuMenuItem.create).not.toHaveBeenCalled()
    expect(tx.menuMenuItem.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { groupId: 'g1', sortOrder: 0 },
    })
  })

  it('reports AMBIGUOUS and skips instead of guessing', async () => {
    tx.menu.findFirst.mockResolvedValue({ id: 'm1', name: 'DINNER', deletedAt: null })
    tx.menuItem.findMany.mockResolvedValue([
      { id: 'p1', name: 'FISH AND CHIPS' },
      { id: 'p2', name: 'FISH AND CHIPS' },
    ])
    tx.menuGroup.findMany.mockResolvedValue([{ id: 'g1', name: 'MAINS', sortOrder: 0 }])

    const res = await POST(req({ venueId: 'v1', menuName: 'DINNER', data: baseData }))
    const json = await res.json()

    expect(json).toMatchObject({ created: 0, matched: 0, linesAdded: 0, linesUpdated: 0, skipped: 1 })
    expect(json.warnings.some((w: string) => w.includes('AMBIGUOUS NAME "FISH AND CHIPS"'))).toBe(true)
    expect(tx.menuItem.create).not.toHaveBeenCalled()
    expect(tx.menuMenuItem.findFirst).not.toHaveBeenCalled()
    expect(tx.menuMenuItem.create).not.toHaveBeenCalled()
    expect(tx.menuMenuItem.update).not.toHaveBeenCalled()
  })

  it('revives a soft-deleted menu with the same name', async () => {
    tx.menu.findFirst.mockResolvedValue({ id: 'm1', name: 'DINNER', deletedAt: new Date(), description: null })

    const res = await POST(req({ venueId: 'v1', menuName: 'DINNER', data: baseData }))

    expect(res.status).toBe(200)
    expect(tx.menu.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' }, data: expect.objectContaining({ deletedAt: null }) }),
    )
    expect(tx.menu.create).not.toHaveBeenCalled()
  })
})
