import { describe, it, expect } from 'vitest'
import { choiceDrawdownQty, mergeDrawdown, type DrawdownChoice } from './order-drawdown'
import type { UomLike } from './unit-convert'

const ML: UomLike = { id: 'u-ml', name: 'ML', baseUnit: 'ml', conversionRatio: 1, kind: 'VOLUME' }
const G: UomLike = { id: 'u-g', name: 'G', baseUnit: 'g', conversionRatio: 1, kind: 'MASS' }
const KG: UomLike = { id: 'u-kg', name: 'KG', baseUnit: 'g', conversionRatio: 1000, kind: 'MASS' }
const EA: UomLike = { id: 'u-ea', name: 'EA', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' }

function choice(over: Partial<DrawdownChoice> = {}): DrawdownChoice {
  return { inventoryItemId: 'i1', qty: 1, uom: EA, item: null, ...over }
}

describe('choiceDrawdownQty', () => {
  it('converts through the UOM ratio in base units when there is no bridge', () => {
    expect(choiceDrawdownQty(choice({ qty: 2, uom: EA }))).toBe(2)
    expect(choiceDrawdownQty(choice({ qty: 0.2, uom: KG }))).toBe(200)
  })

  it('is gram-aware via the item density bridge', () => {
    // 50 mL at 1.2 g/mL = 60 g
    expect(choiceDrawdownQty(choice({ qty: 50, uom: ML, item: { densityGramsPerMl: 1.2 } }))).toBe(60)
    // 2 EA at 40 g each = 80 g
    expect(choiceDrawdownQty(choice({ qty: 2, uom: EA, item: { weightPerUnitGrams: 40 } }))).toBe(80)
  })

  it('is zero for an unmapped choice', () => {
    expect(choiceDrawdownQty(choice({ inventoryItemId: null }))).toBe(0)
    expect(choiceDrawdownQty(choice({ qty: 0 }))).toBe(0)
    expect(choiceDrawdownQty(choice({ qty: -3 }))).toBe(0)
  })

  it('scales by the sold quantity multiplier', () => {
    expect(choiceDrawdownQty(choice({ qty: 50, uom: ML, item: { densityGramsPerMl: 1.2 } }), 2)).toBe(120)
  })
})

describe('mergeDrawdown', () => {
  it('adds a mapped choice to the base recipe explosion', () => {
    const base = new Map([['i1', 100]])
    const out = mergeDrawdown(base, [choice({ qty: 30, uom: G })])
    expect(out.get('i1')).toBe(130)
  })

  it('adds a gram-aware choice to a gram base for the same item', () => {
    const base = new Map([['i1', 100]])
    const out = mergeDrawdown(base, [choice({ qty: 50, uom: ML, item: { densityGramsPerMl: 1.2 } })])
    expect(out.get('i1')).toBe(160)
  })

  it('keeps separate items separate', () => {
    const base = new Map([['i1', 10]])
    const out = mergeDrawdown(base, [
      choice({ inventoryItemId: 'i1', qty: 5, uom: EA }),
      choice({ inventoryItemId: 'i2', qty: 2, uom: EA }),
    ])
    expect([...out.entries()].sort()).toEqual([['i1', 15], ['i2', 2]])
  })

  it('treats an unmapped choice as a no-op', () => {
    const base = new Map([['i1', 10]])
    const out = mergeDrawdown(base, [
      choice({ inventoryItemId: null, qty: 5 }),
      choice({ qty: 0 }),
    ])
    expect(out).toEqual(base)
  })

  it('scales choices by the sold line quantity', () => {
    const out = mergeDrawdown(new Map(), [choice({ qty: 10, uom: EA })], 3)
    expect(out.get('i1')).toBe(30)
  })

  it('does not mutate the base map', () => {
    const base = new Map([['i1', 10]])
    mergeDrawdown(base, [choice({ qty: 5, uom: EA })])
    expect(base.get('i1')).toBe(10)
  })

  it('handles an empty choice list', () => {
    const base = new Map([['i1', 10]])
    expect(mergeDrawdown(base, [])).toEqual(base)
  })
})
