import { describe, it, expect, vi, beforeEach } from 'vitest'
import { diffItemIds, unionCategoryIds, syncMenuItemCategory } from './menu-sync'

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    menuItem: { findFirst: vi.fn(), update: vi.fn() },
    menu: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/woo-push', () => ({
  pushProduct: vi.fn(),
}))

import { prisma } from '@hospo-ops/db'
import { pushProduct } from '@/lib/woo-push'

describe('diffItemIds', () => {
  it('detects added and removed items', () => {
    expect(diffItemIds(['a', 'b', 'c'], ['b', 'd'])).toEqual({ added: ['d'], removed: ['a', 'c'] })
  })

  it('returns empty diffs when nothing changed', () => {
    expect(diffItemIds(['a', 'b'], ['a', 'b'])).toEqual({ added: [], removed: [] })
  })

  it('handles an empty menu', () => {
    expect(diffItemIds([], ['x'])).toEqual({ added: ['x'], removed: [] })
    expect(diffItemIds(['x'], [])).toEqual({ added: [], removed: ['x'] })
  })
})

describe('unionCategoryIds', () => {
  it('joins the distinct categories of an item\'s menus', () => {
    expect(unionCategoryIds([{ wooCategoryId: '17' }, { wooCategoryId: '17' }, { wooCategoryId: '19' }])).toBe('17, 19')
  })

  it('returns null when no menu has a category', () => {
    expect(unionCategoryIds([{ wooCategoryId: null }, { wooCategoryId: null }])).toBeNull()
    expect(unionCategoryIds([])).toBeNull()
  })

  it('ignores nulls alongside real categories', () => {
    expect(unionCategoryIds([{ wooCategoryId: null }, { wooCategoryId: '21' }])).toBe('21')
  })
})

describe('syncMenuItemCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the category and pushes when it changed and a product exists', async () => {
    ;(prisma.menuItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'm1', venueId: 'v1', wooProductId: '104', wooCategoryId: null,
    })
    ;(prisma.menu.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ wooCategoryId: '17' }])

    await syncMenuItemCategory('m1')

    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { wooCategoryId: '17' } })
    expect(pushProduct).toHaveBeenCalledWith('m1')
  })

  it('does not push when the category is unchanged', async () => {
    ;(prisma.menuItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'm1', venueId: 'v1', wooProductId: '104', wooCategoryId: '17',
    })
    ;(prisma.menu.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ wooCategoryId: '17' }])

    await syncMenuItemCategory('m1')

    expect(prisma.menuItem.update).not.toHaveBeenCalled()
    expect(pushProduct).not.toHaveBeenCalled()
  })

  it('does not push when the item has no product (never triggers create-on-missing)', async () => {
    ;(prisma.menuItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'm1', venueId: 'v1', wooProductId: null, wooCategoryId: '17',
    })
    ;(prisma.menu.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])

    await syncMenuItemCategory('m1')

    expect(prisma.menuItem.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { wooCategoryId: null } })
    expect(pushProduct).not.toHaveBeenCalled()
  })
})
