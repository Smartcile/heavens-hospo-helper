import { describe, it, expect } from 'vitest'
import { collectEventItems, computeEventTotals } from '@/lib/event-pricing'

const MENU_ITEMS = [
  { id: 'm1', name: 'ROAST LAMB', price: 42.5 },
  { id: 'm2', name: 'VEGAN RISOTTO', price: 30 },
  { id: 'm3', name: 'HOUSE RED', price: 12 },
]

describe('collectEventItems', () => {
  it('collects items from menu and drinks blocks', () => {
    const items = collectEventItems([
      { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2 }] } },
      { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm3', qty: 4 }] } },
    ])
    expect(items).toEqual([
      { menuItemId: 'm1', qty: 2 },
      { menuItemId: 'm3', qty: 4 },
    ])
  })

  it('ignores non-priced blocks', () => {
    const items = collectEventItems([
      { type: 'TIMELINE', config: { rows: [{ time: '18:00' }] } },
      { type: 'STAFFING', config: { rows: [{ role: 'FOH', count: 6 }] } },
    ])
    expect(items).toEqual([])
  })

  it('merges the same item across blocks', () => {
    const items = collectEventItems([
      { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2 }] } },
      { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 3 }] } },
    ])
    expect(items).toEqual([{ menuItemId: 'm1', qty: 5 }])
  })

  it('skips blank ids and non-positive/invalid quantities', () => {
    const items = collectEventItems([
      {
        type: 'MENU_SELECTION',
        config: {
          items: [
            { menuItemId: '', qty: 2 },
            { menuItemId: 'm1', qty: 0 },
            { menuItemId: 'm2', qty: -1 },
            { menuItemId: 'm3', qty: 'x' },
            { menuItemId: 'm1', qty: 1 },
          ],
        },
      },
    ])
    expect(items).toEqual([{ menuItemId: 'm1', qty: 1 }])
  })

  it('tolerates missing/empty blocks and configs', () => {
    expect(collectEventItems(null)).toEqual([])
    expect(collectEventItems([{ type: 'MENU_SELECTION' }])).toEqual([])
    expect(collectEventItems([{ type: 'MENU_SELECTION', config: { items: 'nope' } }])).toEqual([])
  })
})

describe('computeEventTotals', () => {
  const blocks = [
    { type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'm1', qty: 2 }, { menuItemId: 'm2', qty: 1 }] } },
    { type: 'DRINKS_SELECTION', config: { items: [{ menuItemId: 'm3', qty: 4 }] } },
  ]

  it('prices each line and sums the subtotal', () => {
    const totals = computeEventTotals(blocks, MENU_ITEMS, null)
    expect(totals.lines).toEqual([
      { menuItemId: 'm1', name: 'ROAST LAMB', qty: 2, unitPrice: 42.5, total: 85 },
      { menuItemId: 'm2', name: 'VEGAN RISOTTO', qty: 1, unitPrice: 30, total: 30 },
      { menuItemId: 'm3', name: 'HOUSE RED', qty: 4, unitPrice: 12, total: 48 },
    ])
    expect(totals.subtotal).toBe(163)
    expect(totals.deposit).toBe(0)
    expect(totals.balance).toBe(163)
  })

  it('subtracts the deposit to give the balance', () => {
    const totals = computeEventTotals(blocks, MENU_ITEMS, 50)
    expect(totals.deposit).toBe(50)
    expect(totals.balance).toBe(113)
  })

  it('reports a credit (negative) balance when the deposit exceeds the total', () => {
    // Legitimate — the venue owes the customer the difference.
    expect(computeEventTotals(blocks, MENU_ITEMS, 999).balance).toBe(-836)
    expect(computeEventTotals([], MENU_ITEMS, 999).balance).toBe(-999)
  })

  it('skips items with no matching menu item rather than pricing them at zero', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'gone', qty: 5 }] } }],
      MENU_ITEMS,
      null,
    )
    expect(totals.lines).toEqual([])
    expect(totals.subtotal).toBe(0)
  })

  it('rounds money to two decimals', () => {
    const totals = computeEventTotals(
      [{ type: 'MENU_SELECTION', config: { items: [{ menuItemId: 'x', qty: 3 }] } }],
      [{ id: 'x', name: 'PIE', price: 3.333 }],
      null,
    )
    expect(totals.lines[0].total).toBe(10)
    expect(totals.subtotal).toBe(10)
  })
})
