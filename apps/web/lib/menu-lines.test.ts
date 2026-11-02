import { describe, it, expect } from 'vitest'
import {
  cleanSizes,
  variationSizes,
  lineSizes,
  formatSizePrice,
  groupMenuLines,
  type MenuLineLike,
} from './menu-lines'

describe('cleanSizes', () => {
  it('uppercases labels and keeps prices', () => {
    expect(cleanSizes([{ label: '150ml', price: 8 }, { label: '500ML', price: '12.5' }])).toEqual([
      { label: '150ML', price: 8 },
      { label: '500ML', price: 12.5 },
    ])
  })

  it('drops blank labels and defaults bad prices to 0', () => {
    expect(cleanSizes([{ label: '  ', price: 5 }, { name: 'GLASS' }, { label: 'BOTTLE', price: 'x' }])).toEqual([
      { label: 'GLASS', price: 0 },
      { label: 'BOTTLE', price: 0 },
    ])
  })

  it('returns [] for non-arrays', () => {
    expect(cleanSizes(null)).toEqual([])
    expect(cleanSizes('x')).toEqual([])
  })
})

describe('variationSizes', () => {
  it('reads name/price from MenuItem.variations and ignores wooVariationId', () => {
    expect(
      variationSizes([
        { name: 'small', price: 5, wooVariationId: 99 },
        { name: 'Large', price: 9 },
      ]),
    ).toEqual([
      { label: 'SMALL', price: 5 },
      { label: 'LARGE', price: 9 },
    ])
  })
})

describe('lineSizes', () => {
  it('uses variations for products and sizeOptions for stock', () => {
    expect(lineSizes({ kind: 'PRODUCT', variations: [{ name: '400ML', price: 16.5 }] })).toEqual([{ label: '400ML', price: 16.5 }])
    expect(lineSizes({ kind: 'STOCK', sizeOptions: [{ label: '1.4L', price: 56 }] })).toEqual([{ label: '1.4L', price: 56 }])
  })
})

describe('formatSizePrice', () => {
  it('always shows 2dp', () => {
    expect(formatSizePrice(12.5)).toBe('12.50')
    expect(formatSizePrice(8)).toBe('8.00')
    expect(formatSizePrice(Number('x'))).toBe('0.00')
  })
})

describe('groupMenuLines', () => {
  const line = (over: Partial<MenuLineLike>): MenuLineLike => ({
    id: over.id ?? 'l1',
    kind: 'STOCK',
    groupId: null,
    name: 'COKE',
    price: null,
    sizes: [],
    isActive: true,
    minQty: null,
    maxQty: null,
    sortOrder: 0,
    ...over,
  })

  it('orders groups and lines and drops empty groups', () => {
    const groups = [
      { id: 'g2', name: 'SPIRITS', sortOrder: 1 },
      { id: 'g1', name: 'TAP BEER', sortOrder: 0 },
      { id: 'g3', name: 'EMPTY', sortOrder: 2 },
    ]
    const lines = [
      line({ id: 'a', groupId: 'g2', name: 'GIN', sortOrder: 1 }),
      line({ id: 'b', groupId: 'g1', name: 'ASAHI', sortOrder: 0 }),
    ]
    const out = groupMenuLines(groups, lines)
    expect(out.map((g) => g.name)).toEqual(['TAP BEER', 'SPIRITS'])
    expect(out[0].lines[0].name).toBe('ASAHI')
  })

  it('puts ungrouped lines in a trailing UNGROUPED bucket', () => {
    const out = groupMenuLines([{ id: 'g1', name: 'BEER', sortOrder: 0 }], [
      line({ id: 'a', groupId: 'g1', name: 'ASAHI' }),
      line({ id: 'b', groupId: null, name: 'FRIES' }),
    ])
    expect(out.map((g) => g.name)).toEqual(['BEER', 'UNGROUPED'])
    expect(out[1].lines[0].name).toBe('FRIES')
  })

  it('returns just the ungrouped bucket when there are no groups', () => {
    const out = groupMenuLines([], [line({ id: 'a', name: 'FRIES' })])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBeNull()
  })
})
