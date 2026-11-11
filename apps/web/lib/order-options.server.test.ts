import { beforeEach, describe, expect, it, vi } from 'vitest'

const { prisma } = vi.hoisted(() => ({
  prisma: {
    menuItem: { findMany: vi.fn() },
    menuItemOptionGroup: { findMany: vi.fn() },
  },
}))

vi.mock('@hospo-ops/db', () => ({ prisma }))

import { loadOptionGroupsForItems } from './order-options.server'

const SIDE_GROUP = {
  id: 'g-side',
  menuItemId: 'm1',
  name: 'SIDE',
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 0,
  choices: [
    { id: 'c-fries', name: 'FRIES', priceDelta: 0, isDefault: true, sortOrder: 0 },
    { id: 'c-salad', name: 'SALAD', priceDelta: 3, isDefault: false, sortOrder: 1 },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.menuItem.findMany.mockResolvedValue([
    { id: 'm1', price: 18 },
    { id: 'm2', price: 12 },
  ])
  prisma.menuItemOptionGroup.findMany.mockResolvedValue([
    SIDE_GROUP,
    { ...SIDE_GROUP, id: 'g-side-2', menuItemId: 'm2' },
  ])
})

describe('loadOptionGroupsForItems', () => {
  it('loads own + shared products, maps prices and reports missing ids', async () => {
    const result = await loadOptionGroupsForItems(['m1', 'm2', 'm3'], 'v1')

    expect(result.missingItemIds).toEqual(['m3'])
    expect(result.priceByItem.get('m1')).toBe(18)
    expect(result.priceByItem.get('m2')).toBe(12)
    expect(result.groupsByItem.get('m1')?.[0].name).toBe('SIDE')
    expect(result.groupsByItem.get('m2')?.[0].id).toBe('g-side-2')
    expect(result.groupsByItem.get('m3')).toBeUndefined()
  })

  it('scopes the product lookup to own or shared-in-venue products', async () => {
    await loadOptionGroupsForItems(['m1'], 'v1')

    expect(prisma.menuItem.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['m1'] },
        deletedAt: null,
        OR: [{ venueId: 'v1' }, { venueShares: { some: { venueId: 'v1', isActive: true } } }],
      },
      select: { id: true, price: true },
    })
  })

  it('dedupes ids and skips both queries when there is nothing to load', async () => {
    const result = await loadOptionGroupsForItems([], 'v1')
    expect(result.groupsByItem.size).toBe(0)
    expect(result.priceByItem.size).toBe(0)
    expect(result.missingItemIds).toEqual([])
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled()
    expect(prisma.menuItemOptionGroup.findMany).not.toHaveBeenCalled()
  })
})
