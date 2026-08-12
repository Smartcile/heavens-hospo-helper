import { describe, it, expect } from 'vitest'
import {
  uomKind,
  toGrams,
  toMillilitres,
  cupToDensity,
  massDisplayUnit,
  volumeDisplayUnit,
  convertLine,
  convertQty,
  findKnownIngredient,
  METRIC_CUP_ML,
  METRIC_TBSP_ML,
  METRIC_TSP_ML,
  type UomLike,
  type ItemLike,
  type IngredientRefLike,
} from '@/lib/unit-convert'

const CUP: UomLike = { id: 'cup', name: 'CUP', baseUnit: 'mL', conversionRatio: 250, kind: 'VOLUME' }
const TBSP: UomLike = { id: 'tbsp', name: 'TABLESPOON', baseUnit: 'mL', conversionRatio: 20, kind: 'VOLUME' }
const TSP: UomLike = { id: 'tsp', name: 'TEASPOON', baseUnit: 'mL', conversionRatio: 5, kind: 'VOLUME' }
const ML: UomLike = { id: 'ml', name: 'ML', baseUnit: 'mL', conversionRatio: 1, kind: 'VOLUME' }
const GRAM: UomLike = { id: 'g', name: 'GRAM', baseUnit: 'g', conversionRatio: 1, kind: 'MASS' }
const KG: UomLike = { id: 'kg', name: 'KILOGRAM', baseUnit: 'g', conversionRatio: 1000, kind: 'MASS' }
const EA: UomLike = { id: 'ea', name: 'EACH', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' }
const CASE12: UomLike = { id: 'c12', name: 'CASE 12', baseUnit: 'ea', conversionRatio: 12, kind: 'COUNT' }

const FLOUR: ItemLike = { densityGramsPerMl: 0.528, weightPerUnitGrams: null }
const SUGAR: ItemLike = { densityGramsPerMl: 0.845, weightPerUnitGrams: null }
const EGG: ItemLike = { densityGramsPerMl: 1.03, weightPerUnitGrams: 50 }
const NO_DATA: ItemLike = { densityGramsPerMl: null, weightPerUnitGrams: null }

const REFS: IngredientRefLike[] = [
  { name: 'FLOUR - 00', densityGramsPerMl: 0.528, notes: '1 CUP ≈ 132G' },
  { name: 'FLOUR - SELF RAISING', densityGramsPerMl: 0.528 },
  { name: 'EGG', weightPerUnitGrams: 50 },
]

// toGrams/toMillilitres return number | null; the numeric assertions need a
// non-null helper to satisfy toBe/toBeCloseTo's number-only signatures.
function g(qty: number, uom: UomLike, item?: ItemLike | null): number {
  const v = toGrams(qty, uom, item)
  if (v == null) throw new Error('expected a conversion')
  return v
}
function ml(qty: number, uom: UomLike, item?: ItemLike | null): number {
  const v = toMillilitres(qty, uom, item)
  if (v == null) throw new Error('expected a conversion')
  return v
}

describe('uomKind', () => {
  it('uses the explicit kind when present', () => {
    expect(uomKind(CUP)).toBe('VOLUME')
    expect(uomKind(GRAM)).toBe('MASS')
    expect(uomKind(EA)).toBe('COUNT')
  })

  it('infers from baseUnit when kind is missing (legacy rows)', () => {
    expect(uomKind({ ...CUP, kind: null })).toBe('VOLUME')
    expect(uomKind({ id: 'x', name: 'X', baseUnit: 'g', conversionRatio: 1, kind: null })).toBe('MASS')
    expect(uomKind({ id: 'x', name: 'X', baseUnit: 'ea', conversionRatio: 1, kind: null })).toBe('COUNT')
    expect(uomKind({ id: 'x', name: 'X', baseUnit: 'mL', conversionRatio: 1 })).toBe('VOLUME')
    expect(uomKind({ id: 'x', name: 'X', baseUnit: 'kg', conversionRatio: 1, kind: null })).toBe('MASS')
    expect(uomKind({ id: 'x', name: 'X', baseUnit: 'BUNCH', conversionRatio: 1, kind: null })).toBe('COUNT')
  })
})

describe('toGrams', () => {
  it('volume → grams via density: 1 cup of flour ≈ 132 g', () => {
    expect(g(1, CUP, FLOUR)).toBeCloseTo(132, 0)
  })

  it('metric constants are 250 / 20 / 5', () => {
    expect(METRIC_CUP_ML).toBe(250)
    expect(METRIC_TBSP_ML).toBe(20)
    expect(METRIC_TSP_ML).toBe(5)
  })

  it('same volume, different ingredient → different grams (flour vs sugar)', () => {
    expect(g(1, CUP, SUGAR)).toBeCloseTo(211.25, 1)
    expect(g(1, CUP, FLOUR)).toBeCloseTo(132, 0)
    expect(g(1, CUP, FLOUR)).toBeLessThan(g(1, CUP, SUGAR))
  })

  it('mass → grams is identity via ratio', () => {
    expect(g(2, KG, FLOUR)).toBe(2000)
    expect(g(250, GRAM, FLOUR)).toBe(250)
    expect(g(1, KG, NO_DATA)).toBe(1000) // no density needed
  })

  it('count → grams via weightPerUnit', () => {
    expect(g(3, EA, EGG)).toBe(150)
    expect(g(1, CASE12, EGG)).toBe(600)
  })

  it('returns null when the bridge is missing', () => {
    expect(toGrams(1, CUP, NO_DATA)).toBeNull() // volume, no density
    expect(toGrams(2, EA, NO_DATA)).toBeNull() // count, no unit weight
    expect(toGrams(1, CUP, undefined)).toBeNull()
    expect(toGrams(0, CUP, FLOUR)).toBeNull()
  })
})

describe('toMillilitres', () => {
  it('grams → mL via density (inverse)', () => {
    expect(ml(132, GRAM, FLOUR)).toBeCloseTo(250, 0)
    expect(ml(250, GRAM, FLOUR)).toBeCloseTo(473.5, 0)
  })

  it('volume → mL is identity via ratio', () => {
    expect(ml(1, CUP, FLOUR)).toBe(250)
    expect(ml(2, TBSP, FLOUR)).toBe(40)
  })

  it('count → mL routes through grams when both bridges exist', () => {
    expect(ml(1, EA, EGG)).toBeCloseTo(48.5, 0)
  })

  it('returns null when the bridge is missing', () => {
    expect(toMillilitres(100, GRAM, NO_DATA)).toBeNull()
    expect(toMillilitres(2, EA, NO_DATA)).toBeNull()
  })
})

describe('cupToDensity', () => {
  it('1 CUP = 132 G → 0.528 g/mL (metric 250 mL cup)', () => {
    expect(cupToDensity(132)).toBeCloseTo(0.528, 3)
  })
  it('1 CUP = 250 G → 1.0 g/mL (water-like)', () => {
    expect(cupToDensity(250)).toBeCloseTo(1.0, 3)
  })
})

describe('display units', () => {
  it('massDisplayUnit picks G vs KG sensibly', () => {
    expect(massDisplayUnit(132)).toEqual({ qty: 132, label: 'G' })
    expect(massDisplayUnit(1320)).toEqual({ qty: 1.32, label: 'KG' })
    expect(massDisplayUnit(0.5)).toEqual({ qty: 0.5, label: 'G' })
  })

  it('volumeDisplayUnit picks ML vs L sensibly', () => {
    expect(volumeDisplayUnit(250)).toEqual({ qty: 250, label: 'ML' })
    expect(volumeDisplayUnit(1250)).toEqual({ qty: 1.25, label: 'L' })
  })
})

describe('convertLine', () => {
  it('volume line → WEIGHT mode shows grams', () => {
    expect(convertLine(1, CUP, FLOUR, 'MASS')).toEqual({ qty: 132, label: 'G' })
  })

  it('mass line in WEIGHT mode passes through', () => {
    expect(convertLine(0.5, KG, FLOUR, 'MASS')).toEqual({ qty: 500, label: 'G' })
  })

  it('count line → WEIGHT mode via unit weight', () => {
    expect(convertLine(3, EA, EGG, 'MASS')).toEqual({ qty: 150, label: 'G' })
  })

  it('VOLUME mode converts mass lines to mL when density exists', () => {
    expect(convertLine(250, GRAM, FLOUR, 'VOLUME')).toEqual({ qty: 473, label: 'ML' })
  })

  it('null when no conversion possible', () => {
    expect(convertLine(1, CUP, NO_DATA, 'MASS')).toBeNull()
    expect(convertLine(2, EA, NO_DATA, 'MASS')).toBeNull()
  })
})

describe('convertQty', () => {
  it('1 CUP of flour → grams (physical amount preserved)', () => {
    expect(convertQty(1, CUP, GRAM, FLOUR)).toBeCloseTo(132, 0)
  })

  it('grams → cups round-trips', () => {
    expect(convertQty(132, GRAM, CUP, FLOUR)).toBeCloseTo(1, 0)
  })

  it('mass → mass via ratio (KG → G)', () => {
    expect(convertQty(1, KG, GRAM, FLOUR)).toBe(1000)
  })

  it('count → count via unit weight (EGG → CASE 12)', () => {
    expect(convertQty(12, EA, CASE12, EGG)).toBeCloseTo(1, 0)
  })

  it('null when either side has no bridge', () => {
    expect(convertQty(1, CUP, GRAM, NO_DATA)).toBeNull()
    expect(convertQty(1, GRAM, CUP, NO_DATA)).toBeNull()
  })
})

describe('findKnownIngredient', () => {
  it('exact match (case-insensitive)', () => {
    expect(findKnownIngredient('flour - 00', REFS)?.name).toBe('FLOUR - 00')
  })

  it('contains match', () => {
    expect(findKnownIngredient('FLOUR - 00 TIPO', REFS)?.name).toBe('FLOUR - 00')
  })

  it('ingredient name containing the reference (EGG → EGG)', () => {
    expect(findKnownIngredient('EGG', REFS)?.name).toBe('EGG')
  })

  it('null on empty input or no match', () => {
    expect(findKnownIngredient('', REFS)).toBeNull()
    expect(findKnownIngredient('   ', REFS)).toBeNull()
    expect(findKnownIngredient('CAVIAR', REFS)).toBeNull()
  })
})
