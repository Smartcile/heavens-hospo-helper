import { describe, it, expect } from 'vitest'
import {
  priceExGst,
  grossMarginPct,
  resolveCostUom,
  costOfCanonicalQty,
  costExploded,
  costOfServe,
  type CogsInventoryItem,
} from '@/lib/menu-cogs'
import type { UomLike } from '@/lib/unit-convert'

const UOMS: UomLike[] = [
  { id: 'kg', name: 'KILOGRAM', baseUnit: 'KG', conversionRatio: 1000, kind: 'MASS' },
  { id: 'g', name: 'GRAM', baseUnit: 'G', conversionRatio: 1, kind: 'MASS' },
  { id: 'l', name: 'LITRE', baseUnit: 'L', conversionRatio: 1000, kind: 'VOLUME' },
  { id: 'ml', name: 'MILLILITRE', baseUnit: 'ML', conversionRatio: 1, kind: 'VOLUME' },
  { id: 'ea', name: 'EACH', baseUnit: 'EA', conversionRatio: 1, kind: 'COUNT' },
]

const flour: CogsInventoryItem = { id: 'i1', unit: 'KILOGRAM', costPrice: 1.9, densityGramsPerMl: 0.528 }
const eggs: CogsInventoryItem = { id: 'i2', unit: 'EACH', costPrice: 0.45 }
const milk: CogsInventoryItem = { id: 'i3', unit: 'LITRE', costPrice: 2.1 }

describe('menu-cogs', () => {
  it('strips GST from a price', () => {
    expect(priceExGst(115)).toBeCloseTo(100, 5)
    expect(priceExGst(0)).toBe(0)
  })

  it('computes gross margin %', () => {
    expect(grossMarginPct(4, 10)).toBeCloseTo(60, 5)
    expect(grossMarginPct(1, 0)).toBeNull()
  })

  it('resolves an item unit to a UOM by name or base unit', () => {
    expect(resolveCostUom('KILOGRAM', UOMS)?.id).toBe('kg')
    expect(resolveCostUom('kg', UOMS)?.id).toBe('kg')
    expect(resolveCostUom('', UOMS)).toBeNull()
  })

  it('costs a non-bridged mass item (grams against $/kg)', () => {
    // 250 g of flour at $1.90/kg = $0.475
    expect(costOfCanonicalQty(250, flour, UOMS)).toBeCloseTo(0.475, 5)
  })

  it('costs a count item and a volume item', () => {
    expect(costOfCanonicalQty(2, eggs, UOMS)).toBeCloseTo(0.9, 5)
    expect(costOfCanonicalQty(250, milk, UOMS)).toBeCloseTo(0.525, 5) // 250 mL @ $2.10/L
  })

  it('bridges grams to a litre cost unit via density', () => {
    // flour exploded to grams (bridged) but costed per LITRE: 500 g / 0.528 g/mL
    const perLitre: CogsInventoryItem = { id: 'i4', unit: 'LITRE', costPrice: 10, densityGramsPerMl: 0.5 }
    expect(costOfCanonicalQty(500, perLitre, UOMS)).toBeCloseTo(10, 5)
  })

  it('flags a partial cost when an ingredient is unpriced', () => {
    const index = new Map<string, CogsInventoryItem>([
      ['i1', flour],
      ['i9', { id: 'i9', unit: 'EACH', costPrice: null }],
    ])
    const res = costExploded([{ id: 'i1', qty: 1000 }, { id: 'i9', qty: 1 }], index, UOMS)
    expect(res.cost).toBeCloseTo(1.9, 5)
    expect(res.partial).toBe(true)
  })

  it('costs a serve from qty + uom + item', () => {
    // 400 mL pour of milk ($2.10/L)
    const ml = UOMS.find((u) => u.id === 'ml')!
    expect(costOfServe(400, ml, milk, UOMS)).toBeCloseTo(0.84, 5)
    expect(costOfServe(400, null, milk, UOMS)).toBeNull()
  })
})
