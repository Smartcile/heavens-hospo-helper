import { describe, it, expect } from 'vitest'
import {
  validateOrderAgainstMenu,
  menuAllowsPartySize,
  describePaxRange,
  type MenuRules,
  type MenuItemRules,
} from '@/lib/menu-rules'

const CATERING: MenuRules = { name: 'EVENT CATERING', minPax: 20, maxPax: 150 }
const BISTRO: MenuRules = { name: 'FRIDAY NIGHT BISTRO' }

const ITEMS: MenuItemRules[] = [
  { menuItemId: 'platter', name: 'COLD PLATTER', minQty: 2, maxQty: 8 },
  { menuItemId: 'steak', name: 'SIRLOIN', minQty: null, maxQty: null },
  { menuItemId: 'cake', name: 'CELEBRATION CAKE', minQty: null, maxQty: 1 },
]

describe('validateOrderAgainstMenu — menu level', () => {
  it('accepts a party within range', () => {
    expect(validateOrderAgainstMenu(CATERING, ITEMS, [], 50)).toEqual([])
  })

  it('rejects a party below the minimum', () => {
    const v = validateOrderAgainstMenu(CATERING, ITEMS, [], 10)
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('PAX_BELOW_MIN')
    expect(v[0].message).toContain('AT LEAST 20')
  })

  it('rejects a party above the maximum', () => {
    const v = validateOrderAgainstMenu(CATERING, ITEMS, [], 200)
    expect(v[0].kind).toBe('PAX_ABOVE_MAX')
  })

  it('accepts the exact boundaries', () => {
    expect(validateOrderAgainstMenu(CATERING, ITEMS, [], 20)).toEqual([])
    expect(validateOrderAgainstMenu(CATERING, ITEMS, [], 150)).toEqual([])
  })

  it('treats an unknown party size as missing info, not a violation', () => {
    expect(validateOrderAgainstMenu(CATERING, ITEMS, [], null)).toEqual([])
    expect(validateOrderAgainstMenu(CATERING, ITEMS, [], undefined)).toEqual([])
  })

  it('applies no pax rules on an unbounded menu', () => {
    expect(validateOrderAgainstMenu(BISTRO, ITEMS, [], 1)).toEqual([])
    expect(validateOrderAgainstMenu(BISTRO, ITEMS, [], 9999)).toEqual([])
  })
})

describe('validateOrderAgainstMenu — item level', () => {
  it('accepts quantities inside the limits', () => {
    const lines = [{ menuItemId: 'platter', qty: 4 }, { menuItemId: 'steak', qty: 30 }]
    expect(validateOrderAgainstMenu(CATERING, ITEMS, lines, 50)).toEqual([])
  })

  it('rejects a quantity below the item minimum', () => {
    const v = validateOrderAgainstMenu(CATERING, ITEMS, [{ menuItemId: 'platter', qty: 1 }], 50)
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('QTY_BELOW_MIN')
    expect(v[0].menuItemId).toBe('platter')
  })

  it('rejects a quantity above the item maximum', () => {
    const v = validateOrderAgainstMenu(CATERING, ITEMS, [{ menuItemId: 'cake', qty: 3 }], 50)
    expect(v[0].kind).toBe('QTY_ABOVE_MAX')
  })

  it('does NOT force a minimum-qty item onto every order', () => {
    // The platter has minQty 2, but an order without it is perfectly valid.
    const v = validateOrderAgainstMenu(CATERING, ITEMS, [{ menuItemId: 'steak', qty: 40 }], 50)
    expect(v).toEqual([])
  })

  it('ignores limits on a zero-quantity line', () => {
    expect(validateOrderAgainstMenu(CATERING, ITEMS, [{ menuItemId: 'platter', qty: 0 }], 50)).toEqual([])
  })

  it('sums duplicate lines for the same item before checking', () => {
    // Two lines of 1 satisfy a minimum of 2 — checking them separately would
    // wrongly reject a legitimate order.
    const lines = [{ menuItemId: 'platter', qty: 1 }, { menuItemId: 'platter', qty: 1 }]
    expect(validateOrderAgainstMenu(CATERING, ITEMS, lines, 50)).toEqual([])
  })

  it('catches a maximum breached only by the combined total', () => {
    const lines = [{ menuItemId: 'cake', qty: 1 }, { menuItemId: 'cake', qty: 1 }]
    const v = validateOrderAgainstMenu(CATERING, ITEMS, lines, 50)
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('QTY_ABOVE_MAX')
  })

  it('flags an item that is not on the menu', () => {
    const v = validateOrderAgainstMenu(CATERING, ITEMS, [{ menuItemId: 'ghost', qty: 1 }], 50)
    expect(v[0].kind).toBe('ITEM_NOT_ON_MENU')
    expect(v[0].menuItemId).toBe('ghost')
  })

  it('applies no limits to an item with null min and max', () => {
    expect(validateOrderAgainstMenu(BISTRO, ITEMS, [{ menuItemId: 'steak', qty: 500 }], 4)).toEqual([])
  })

  it('reports every violation at once, not just the first', () => {
    const lines = [{ menuItemId: 'platter', qty: 99 }, { menuItemId: 'cake', qty: 5 }]
    const v = validateOrderAgainstMenu(CATERING, ITEMS, lines, 5)
    expect(v.map((x) => x.kind).sort()).toEqual(['PAX_BELOW_MIN', 'QTY_ABOVE_MAX', 'QTY_ABOVE_MAX'])
  })
})

describe('menuAllowsPartySize', () => {
  it('gates on the range', () => {
    expect(menuAllowsPartySize(CATERING, 50)).toBe(true)
    expect(menuAllowsPartySize(CATERING, 5)).toBe(false)
    expect(menuAllowsPartySize(CATERING, 500)).toBe(false)
  })

  it('allows anything when the size is unknown or the menu unbounded', () => {
    expect(menuAllowsPartySize(CATERING, null)).toBe(true)
    expect(menuAllowsPartySize(BISTRO, 1)).toBe(true)
  })
})

describe('describePaxRange', () => {
  it('formats each combination', () => {
    expect(describePaxRange(CATERING)).toBe('20–150 PAX')
    expect(describePaxRange({ name: 'X', minPax: 10 })).toBe('10+ PAX')
    expect(describePaxRange({ name: 'X', maxPax: 40 })).toBe('UP TO 40 PAX')
    expect(describePaxRange(BISTRO)).toBeNull()
  })
})
