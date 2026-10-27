import { describe, it, expect } from 'vitest'
import {
  UNCATEGORISED,
  buildProductLinks,
  groupProductsByCategory,
  parseProducts,
  type MenuItemRef,
  type SwiftPosProduct,
} from '@/lib/swiftpos-products'

function product(over: Partial<SwiftPosProduct> & { inventoryCode: string }): SwiftPosProduct {
  return {
    description: over.inventoryCode,
    category: 'BEER',
    printGroupName: '',
    masterGroupName: '',
    active: true,
    discontinued: false,
    price: 0,
    ...over,
  }
}

describe('parseProducts', () => {
  it('reads the page envelope (camelCase) with hasMore + total', () => {
    const page = parseProducts({
      page: 1,
      pageSize: 100,
      total: 250,
      hasMore: true,
      rows: [
        { inventoryCode: 'TAP ASAHI', description: 'Asahi', category: 'BEER', printGroupName: 'BAR', masterGroupName: 'BEV', price: 12.5 },
      ],
    })
    expect(page.hasMore).toBe(true)
    expect(page.total).toBe(250)
    expect(page.rows[0]).toEqual({
      inventoryCode: 'TAP ASAHI',
      description: 'Asahi',
      category: 'BEER',
      printGroupName: 'BAR',
      masterGroupName: 'BEV',
      active: false,
      discontinued: false,
      price: 12.5,
    })
  })

  it('reads PascalCase rows and coerces short flags/price strings', () => {
    const page = parseProducts({
      Rows: [{ InventoryCode: 'X', Description: 'X', Category: '', Active: 1, Discontinued: 0, Price: '9.9' }],
      HasMore: false,
      Total: 1,
    })
    expect(page.rows[0]).toMatchObject({ inventoryCode: 'X', active: true, discontinued: false, price: 9.9 })
  })

  it('tolerates a bare array and drops malformed / duplicate codes', () => {
    const page = parseProducts([
      { inventoryCode: 'A' },
      { inventoryCode: 'a' },
      { description: 'no code' },
      null,
    ])
    expect(page.rows.map((r) => r.inventoryCode)).toEqual(['A'])
    expect(page.hasMore).toBe(false)
    expect(page.total).toBe(1)
    expect(parseProducts(null)).toEqual({ rows: [], hasMore: false, total: 0 })
  })
})

describe('buildProductLinks', () => {
  const products = [
    product({ inventoryCode: 'TAP ASAHI', description: 'Asahi' }),
    product({ inventoryCode: 'BTL HEINEKEN', description: 'Heineken' }),
    product({ inventoryCode: 'UNMAPPED', description: 'Nothing local' }),
    product({ inventoryCode: 'DUP', description: 'Duplicated code' }),
  ]

  const menuItems: MenuItemRef[] = [
    { id: 'm1', name: 'ASAHI TAP', swiftPosId: 'tap asahi' },
    { id: 'm2', name: 'HEINEKEN', swiftPosId: null },
    { id: 'm3', name: 'GONE', swiftPosId: 'DELETED POS ITEM' },
    { id: 'm4', name: 'DUP ONE', swiftPosId: 'DUP' },
    { id: 'm5', name: 'DUP TWO', swiftPosId: 'dup' },
  ]

  it('classifies linked / unlinked rows case-insensitively', () => {
    const report = buildProductLinks(products, menuItems)
    expect(report.rows.find((r) => r.inventoryCode === 'TAP ASAHI')?.linked).toEqual([{ id: 'm1', name: 'ASAHI TAP' }])
    expect(report.rows.find((r) => r.inventoryCode === 'BTL HEINEKEN')?.linked).toEqual([])
    expect(report.linkedCount).toBe(2) // TAP ASAHI + DUP
    expect(report.unlinkedCount).toBe(2) // BTL HEINEKEN + UNMAPPED
  })

  it('surfaces duplicate codes instead of letting one win', () => {
    const report = buildProductLinks(products, menuItems)
    expect(report.duplicates).toEqual([{ code: 'DUP', items: [{ id: 'm4', name: 'DUP ONE' }, { id: 'm5', name: 'DUP TWO' }] }])
    expect(report.rows.find((r) => r.inventoryCode === 'DUP')?.linked).toHaveLength(2)
  })

  it('lists local codes missing from the SwiftPOS master as orphans', () => {
    const report = buildProductLinks(products, menuItems)
    expect(report.orphans).toEqual([{ code: 'DELETED POS ITEM', items: [{ id: 'm3', name: 'GONE' }] }])
    expect(report.orphansSuppressed).toBe(false)
  })

  it('hides orphans when the product catalogue is truncated', () => {
    const report = buildProductLinks(products, menuItems, { truncated: true })
    expect(report.orphans).toEqual([])
    expect(report.orphansSuppressed).toBe(true)
    // Duplicates come from the local list, so they stay reliable.
    expect(report.duplicates).toHaveLength(1)
  })
})

describe('groupProductsByCategory', () => {
  it('groups alphabetically, sorts rows, and pins UNCATEGORISED last', () => {
    const rows = buildProductLinks(
      [
        product({ inventoryCode: 'Z', description: 'Zebra', category: '' }),
        product({ inventoryCode: 'B', description: 'Beta', category: 'WINE' }),
        product({ inventoryCode: 'A', description: 'Alpha', category: 'BEER' }),
        product({ inventoryCode: 'C', description: 'Charlie', category: 'BEER' }),
      ],
      [],
    ).rows

    const groups = groupProductsByCategory(rows)
    expect(groups.map((g) => g.category)).toEqual(['BEER', 'WINE', UNCATEGORISED])
    expect(groups[0].rows.map((r) => r.description)).toEqual(['Alpha', 'Charlie'])
  })
})
