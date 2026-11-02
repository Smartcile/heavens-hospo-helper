import { describe, it, expect } from 'vitest'
import {
  serveTargetKind,
  validateServe,
  serveSizeLabel,
  summariseServes,
  summariseMethods,
  cleanServes,
  type ServeLike,
} from './menu-serves'

function serve(over: Partial<ServeLike> = {}): ServeLike {
  return {
    method: 'POURED',
    label: null,
    qty: 30,
    uom: { name: 'ML' },
    recipe: null,
    inventoryItem: { name: 'SEA LOVERS GIN' },
    ...over,
  }
}

describe('serveTargetKind', () => {
  it('is recipe, stock, or null', () => {
    expect(serveTargetKind({ recipeId: 'r1' })).toBe('RECIPE')
    expect(serveTargetKind({ inventoryItemId: 'i1' })).toBe('STOCK')
    expect(serveTargetKind({})).toBeNull()
  })
})

describe('validateServe', () => {
  it('requires exactly one target', () => {
    expect(validateServe({})).toMatch(/RECIPE OR A STOCK ITEM/)
    expect(validateServe({ recipeId: 'r', inventoryItemId: 'i', qty: 1 })).toMatch(/ONE TARGET/)
  })

  it('requires a positive quantity', () => {
    expect(validateServe({ recipeId: 'r', qty: 0 })).toMatch(/QUANTITY/)
  })

  it('requires a unit for a stock serve', () => {
    expect(validateServe({ inventoryItemId: 'i', qty: 30 })).toMatch(/PICK A UNIT/)
  })

  it('rejects a cross-kind serve — the bottle-sold-as-a-cup case', () => {
    expect(
      validateServe({ inventoryItemId: 'i', qty: 1, uomId: 'u' }, { targetKind: 'COUNT', uomKind: 'VOLUME' }),
    ).toMatch(/UNIT MISMATCH/)
    expect(
      validateServe({ inventoryItemId: 'i', qty: 30, uomId: 'u' }, { targetKind: 'VOLUME', uomKind: 'VOLUME' }),
    ).toBeNull()
  })

  it('allows a recipe serve with no unit', () => {
    expect(validateServe({ recipeId: 'r', qty: 1 })).toBeNull()
  })
})

describe('labels & summaries', () => {
  it('serveSizeLabel trims', () => {
    expect(serveSizeLabel(400, 'ML')).toBe('400 ML')
    expect(serveSizeLabel(1.4, 'L')).toBe('1.4 L')
    expect(serveSizeLabel(1, null)).toBe('1')
  })

  it('summariseServes joins sizes and prefixes the label', () => {
    expect(
      summariseServes([
        serve({ label: '400ML', qty: 400 }),
        serve({ label: '1.4L', qty: 1.4, uom: { name: 'L' } }),
      ]),
    ).toBe('400ML · 400 ML / 1.4L · 1.4 L')
    expect(summariseServes([])).toBeNull()
  })

  it('summariseMethods de-dupes and preserves order', () => {
    expect(
      summariseMethods([{ method: 'DRAUGHT' }, { method: 'DRAUGHT' }, { method: 'WINE' }]),
    ).toBe('DRAUGHT, WINE')
    expect(summariseMethods([])).toBeNull()
  })
})

describe('cleanServes', () => {
  it('drops rows with no target or two targets and applies defaults', () => {
    const cleaned = cleanServes([
      { method: 'POURED', inventoryItemId: 'i', qty: 30, uomId: 'u', label: ' 30ml ' },
      { recipeId: 'r', inventoryItemId: 'i' },
      {},
      { recipeId: 'r2' },
    ])
    expect(cleaned).toEqual([
      { label: '30ML', method: 'POURED', recipeId: null, inventoryItemId: 'i', qty: 30, uomId: 'u' },
      { label: null, method: 'OTHER', recipeId: 'r2', inventoryItemId: null, qty: 1, uomId: null },
    ])
  })
})
