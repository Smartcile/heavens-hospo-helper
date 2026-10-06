import { describe, it, expect } from 'vitest'
import { parseSalesReport, matchSalesToItems, type MatchableItem } from './swiftpos'

describe('parseSalesReport', () => {
  it('reads the { rows } shape (camelCase)', () => {
    const rows = parseSalesReport({
      groupBy: 'product',
      rows: [
        { key: 'TAP ASAHI', label: 'Asahi', qty: 12, gross: 168, net: 146.09 },
        { key: 'BTL HEINEKEN', label: 'Heineken', qty: 3, gross: 30, net: 26.09 },
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ inventoryCode: 'TAP ASAHI', label: 'Asahi', qty: 12, gross: 168, net: 146.09 })
  })

  it('reads PascalCase and a bare rows array, and coerces numeric strings', () => {
    const rows = parseSalesReport([{ Key: 'X', Label: 'X', Qty: '2.5', Gross: '10', Net: '8.7' }])
    expect(rows[0]).toEqual({ inventoryCode: 'X', label: 'X', qty: 2.5, gross: 10, net: 8.7 })
  })

  it('drops rows with no product code and tolerates junk', () => {
    expect(parseSalesReport({ rows: [{ label: 'no code' }, null, 'nope'] })).toEqual([])
    expect(parseSalesReport(null)).toEqual([])
  })
})

describe('matchSalesToItems', () => {
  const ITEMS: MatchableItem[] = [
    { id: 'm1', name: 'ASAHI TAP', swiftPosId: 'Tap Asahi' },
    { id: 'm2', name: 'HEINEKEN', swiftPosId: 'Btl Heineken' },
    { id: 'm3', name: 'NO CODE', swiftPosId: null },
  ]

  it('matches case-insensitively by code and reports unmatched sales', () => {
    const sales = parseSalesReport({
      rows: [
        { key: 'TAP ASAHI', qty: 12, gross: 168 },
        { key: 'BTL HEINEKEN', qty: 3, gross: 30 },
        { key: 'SOMETHING ELSE', qty: 5, gross: 40 },
      ],
    })
    const m = matchSalesToItems(sales, ITEMS)
    expect(m.matched.map((s) => [s.inventoryCode, s.itemName])).toEqual([
      ['TAP ASAHI', 'ASAHI TAP'],
      ['BTL HEINEKEN', 'HEINEKEN'],
    ])
    expect(m.unmatched.map((s) => s.inventoryCode)).toEqual(['SOMETHING ELSE'])
    expect(m.totalQty).toBe(20)
    expect(m.matchedQty).toBe(15)
  })

  it('leaves every sale unmatched when no products carry a code', () => {
    const m = matchSalesToItems([{ inventoryCode: 'X', label: '', qty: 1, gross: 0, net: 0 }], ITEMS)
    expect(m.matched).toHaveLength(0)
    expect(m.unmatched).toHaveLength(1)
  })
})
