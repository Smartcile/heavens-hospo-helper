import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { db, tx, getServerSession, guardAccess } = vi.hoisted(() => {
  const tx = {
    menu: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuGroup: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuItem: { findMany: vi.fn(), create: vi.fn() },
    menuMenuItem: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuItemOptionGroup: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuItemOptionChoice: { create: vi.fn(), update: vi.fn() },
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
  tx.menuItemOptionGroup.findMany.mockResolvedValue([])
  tx.menuItemOptionGroup.create.mockResolvedValue({ id: 'og1' })
  tx.menuItemOptionGroup.update.mockResolvedValue({ id: 'og1' })
  tx.menuItemOptionChoice.create.mockImplementation(
    async ({ data }: { data: { name: string } }) => ({ id: `oc-${data.name}`, ...data }),
  )
  tx.menuItemOptionChoice.update.mockResolvedValue({ id: 'oc1' })
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
      optionGroupsAdded: 1,
      optionChoicesAdded: 1,
      optionsSkipped: 0,
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
    expect(tx.menuItemOptionGroup.create).toHaveBeenCalledWith({
      data: { menuItemId: 'p1', name: 'SIDE', minSelect: 0, maxSelect: 1, sortOrder: 0 },
    })
    expect(tx.menuItemOptionChoice.create).toHaveBeenCalledWith({
      data: { groupId: 'og1', name: 'FRIES', priceDelta: 0, isDefault: false, sortOrder: 0 },
    })
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

  it('adds only missing option groups/choices to a matched product', async () => {
    tx.menu.findFirst.mockResolvedValue({ id: 'm1', name: 'DINNER', deletedAt: null })
    tx.menuItem.findMany.mockResolvedValue([{ id: 'p1', name: 'FISH AND CHIPS' }])
    tx.menuGroup.findMany.mockResolvedValue([{ id: 'g1', name: 'MAINS', sortOrder: 0 }])
    tx.menuItemOptionGroup.findMany.mockResolvedValue([
      { id: 'og-side', name: 'SIDE', deletedAt: null, choices: [{ id: 'oc-fries', name: 'FRIES', deletedAt: null }] },
    ])
    tx.menuItemOptionGroup.create.mockResolvedValueOnce({ id: 'og-drink' })

    const res = await POST(req({
      venueId: 'v1',
      menuName: 'DINNER',
      data: {
        name: 'DINNER',
        description: null,
        groups: [{
          name: 'MAINS',
          area: null,
          items: [{
            name: 'FISH AND CHIPS',
            price: 24.5,
            description: 'battered',
            sizes: [],
            options: [
              {
                name: 'SIDE',
                required: true,
                min: 1,
                max: 1,
                choices: [
                  { name: 'FRIES', priceDelta: 5 },
                  { name: 'SALAD', priceDelta: 0 },
                ],
              },
              { name: 'DRINK', required: false, min: 0, max: 1, choices: [{ name: 'COKE', priceDelta: 0 }] },
            ],
          }],
        }],
      },
    }))
    const json = await res.json()

    expect(json).toMatchObject({ matched: 1, optionGroupsAdded: 1, optionChoicesAdded: 2, optionsSkipped: 0 })
    const createdGroups = tx.menuItemOptionGroup.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { name: string } }).data.name,
    )
    expect(createdGroups).toEqual(['DRINK'])
    // The curated SIDE group and its FRIES choice are never rewritten.
    expect(tx.menuItemOptionGroup.update).not.toHaveBeenCalled()
    expect(tx.menuItemOptionChoice.update).not.toHaveBeenCalled()
    const createdChoices = tx.menuItemOptionChoice.create.mock.calls.map(
      (call: unknown[]) => (call[0] as { data: { groupId: string; name: string } }).data,
    )
    expect(createdChoices).toEqual(expect.arrayContaining([
      expect.objectContaining({ groupId: 'og-side', name: 'SALAD' }),
      expect.objectContaining({ groupId: 'og-drink', name: 'COKE' }),
    ]))
  })

  it('re-importing the same options creates no duplicates', async () => {
    tx.menu.findFirst.mockResolvedValue({ id: 'm1', name: 'DINNER', deletedAt: null })
    tx.menuItem.findMany.mockResolvedValue([{ id: 'p1', name: 'FISH AND CHIPS' }])
    tx.menuGroup.findMany.mockResolvedValue([{ id: 'g1', name: 'MAINS', sortOrder: 0 }])
    tx.menuItemOptionGroup.findMany.mockResolvedValue([
      { id: 'og-side', name: 'SIDE', deletedAt: null, choices: [{ id: 'oc-fries', name: 'FRIES', deletedAt: null }] },
    ])

    const res = await POST(req({
      venueId: 'v1',
      menuName: 'DINNER',
      data: {
        name: 'DINNER',
        description: null,
        groups: [{
          name: 'MAINS',
          area: null,
          items: [{
            name: 'FISH AND CHIPS',
            price: 24.5,
            description: 'battered',
            sizes: [],
            options: [{
              name: 'SIDE',
              required: true,
              min: 1,
              max: 1,
              choices: [{ name: 'FRIES', priceDelta: 0 }],
            }],
          }],
        }],
      },
    }))
    const json = await res.json()

    expect(json).toMatchObject({ optionGroupsAdded: 0, optionChoicesAdded: 0, optionsSkipped: 0 })
    expect(tx.menuItemOptionGroup.create).not.toHaveBeenCalled()
    expect(tx.menuItemOptionChoice.create).not.toHaveBeenCalled()
  })

  it('reports and skips invalid option groups', async () => {
    const res = await POST(req({
      venueId: 'v1',
      menuName: 'DINNER',
      data: {
        name: 'DINNER',
        description: null,
        groups: [{
          name: 'MAINS',
          area: null,
          items: [{
            name: 'FISH AND CHIPS',
            price: 24.5,
            description: 'battered',
            sizes: [],
            options: [{
              name: 'SIDE',
              required: true,
              min: 1,
              max: 3,
              choices: [{ name: 'FRIES', priceDelta: 0 }],
            }],
          }],
        }],
      },
    }))
    const json = await res.json()

    expect(json).toMatchObject({ optionGroupsAdded: 0, optionChoicesAdded: 0, optionsSkipped: 1 })
    expect(json.warnings.some((w: string) => w.includes('OPTION "SIDE" ON "FISH AND CHIPS" SKIPPED'))).toBe(true)
    expect(tx.menuItemOptionGroup.create).not.toHaveBeenCalled()
    expect(tx.menuItemOptionChoice.create).not.toHaveBeenCalled()
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
