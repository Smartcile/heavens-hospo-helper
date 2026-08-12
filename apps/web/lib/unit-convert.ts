/**
 * Volume ↔ weight ↔ count conversion engine — pure, Prisma-free.
 *
 * The unit model: every UOM has a dimension (`kind`) and a ratio to a
 * canonical base (VOLUME → mL, MASS → g, COUNT → ea). An inventory item
 * carries the per-ingredient bridge:
 *   - densityGramsPerMl  — 1 mL of the item weighs X g (volume ↔ mass)
 *   - weightPerUnitGrams — 1 EA weighs X g (count → mass)
 * All conversions route through grams. 1 cup of flour is 250 mL × 0.528 g/mL
 * ≈ 132 g; 1 cup of sugar is 250 mL × 0.845 g/mL ≈ 211 g.
 *
 * METRIC volumes (NZ/AU standard): 1 cup = 250 mL, 1 tbsp = 20 mL, 1 tsp = 5 mL.
 */

export type UnitKind = 'VOLUME' | 'MASS' | 'COUNT'

export type UomLike = {
  id: string
  name: string
  baseUnit: string
  conversionRatio: number
  kind?: string | null
}

export type ItemLike = {
  densityGramsPerMl?: number | null
  weightPerUnitGrams?: number | null
}

export type IngredientRefLike = {
  name: string
  densityGramsPerMl?: number | null
  weightPerUnitGrams?: number | null
  notes?: string | null
}

export const METRIC_CUP_ML = 250
export const METRIC_TBSP_ML = 20
export const METRIC_TSP_ML = 5

const VOLUME_BASES = ['ml', 'l', 'litre']
const MASS_BASES = ['g', 'kg', 'gram']

/** The dimension of a UOM — explicit `kind` wins, baseUnit is the fallback. */
export function uomKind(uom: UomLike): UnitKind {
  const k = uom.kind
  if (k === 'VOLUME' || k === 'MASS' || k === 'COUNT') return k
  const base = (uom.baseUnit || '').toLowerCase().trim()
  if (VOLUME_BASES.some((p) => base.startsWith(p))) return 'VOLUME'
  if (MASS_BASES.some((p) => base.startsWith(p))) return 'MASS'
  return 'COUNT'
}

/**
 * Convert a quantity to grams. Every dimension routes through here:
 *   VOLUME → mL × density
 *   MASS   → g (identity, ratio already converts to the g base)
 *   COUNT  → ea × weightPerUnit
 * Returns null when the item has no density / unit weight to bridge with.
 */
export function toGrams(qty: number, uom: UomLike, item?: ItemLike | null): number | null {
  if (!qty || !uom) return null
  const kind = uomKind(uom)
  if (kind === 'MASS') return qty * (uom.conversionRatio || 1)
  if (kind === 'VOLUME') {
    const density = item?.densityGramsPerMl
    if (!density) return null
    return qty * (uom.conversionRatio || 1) * density
  }
  const perUnit = item?.weightPerUnitGrams
  if (!perUnit) return null
  return qty * (uom.conversionRatio || 1) * perUnit
}

/**
 * Convert a quantity to millilitres (inverse of toGrams).
 * Returns null when the item has no density / unit weight to bridge with.
 */
export function toMillilitres(qty: number, uom: UomLike, item?: ItemLike | null): number | null {
  if (!qty || !uom) return null
  const kind = uomKind(uom)
  if (kind === 'VOLUME') return qty * (uom.conversionRatio || 1)
  if (kind === 'MASS') {
    const density = item?.densityGramsPerMl
    if (!density) return null
    return (qty * (uom.conversionRatio || 1)) / density
  }
  const perUnit = item?.weightPerUnitGrams
  const density = item?.densityGramsPerMl
  if (!perUnit || !density) return null
  return (qty * perUnit) / density
}

/** Grams per mL from a metric-cup weight ("1 CUP = 132 G" → 0.528). */
export function cupToDensity(gramsPerCup: number): number {
  return gramsPerCup / METRIC_CUP_ML
}

/** The best display unit for a mass in grams: "G" under 1000, else "KG". */
export function massDisplayUnit(grams: number): { qty: number; label: string } {
  if (grams >= 1000) return { qty: roundTo(grams / 1000, 2), label: 'KG' }
  return { qty: roundTo(grams, grams >= 100 ? 0 : 1), label: 'G' }
}

/** The best display unit for a volume in mL: "ML" under 1000, else "L". */
export function volumeDisplayUnit(millilitres: number): { qty: number; label: string } {
  if (millilitres >= 1000) return { qty: roundTo(millilitres / 1000, 2), label: 'L' }
  return { qty: roundTo(millilitres, 0), label: 'ML' }
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals)
  return Math.round(n * f) / f
}

/**
 * Convert a quantity expressed in one UOM to another UOM of the same item —
 * routes through grams. Used when the user changes a recipe line's UOM so the
 * physical amount is preserved (1 CUP → 132 G). Returns null when either side
 * has no bridge (no density / unit weight).
 */
export function convertQty(qty: number, fromUom: UomLike, toUom: UomLike, item?: ItemLike | null): number | null {
  if (!fromUom || !toUom) return null
  const grams = toGrams(qty, fromUom, item)
  if (grams == null) return null
  const kind = uomKind(toUom)
  if (kind === 'MASS') return grams / (toUom.conversionRatio || 1)
  if (kind === 'VOLUME') {
    const density = item?.densityGramsPerMl
    if (!density) return null
    return grams / density / (toUom.conversionRatio || 1)
  }
  const perUnit = item?.weightPerUnitGrams
  if (!perUnit) return null
  return grams / perUnit / (toUom.conversionRatio || 1)
}

/**
 * Convert a recipe line to a target dimension for DISPLAY (never storage).
 * target 'MASS' → grams; target 'VOLUME' → millilitres.
 * Returns null when the conversion is impossible (no density on the item).
 */
export function convertLine(
  qty: number,
  uom: UomLike,
  item: ItemLike | null | undefined,
  target: 'MASS' | 'VOLUME',
): { qty: number; label: string } | null {
  if (!uom) return null
  if (uomKind(uom) === target) {
    // Already the right dimension — show in the canonical base unit.
    return target === 'MASS' ? massDisplayUnit(qty * (uom.conversionRatio || 1)) : volumeDisplayUnit(qty * (uom.conversionRatio || 1))
  }
  const grams = target === 'MASS' ? toGrams(qty, uom, item) : toMillilitres(qty, uom, item)
  if (grams == null || !isFinite(grams)) return null
  return target === 'MASS' ? massDisplayUnit(grams) : volumeDisplayUnit(grams)
}

/**
 * Find a known ingredient by name — exact match first, then case-insensitive
 * "contains". Used to auto-suggest densities when creating inventory items.
 */
export function findKnownIngredient<T extends IngredientRefLike>(name: string, refs: T[]): T | null {
  const upper = (name || '').toUpperCase().trim()
  if (!upper) return null
  const exact = refs.find((r) => r.name.toUpperCase() === upper)
  if (exact) return exact
  return refs.find((r) => r.name.toUpperCase().includes(upper) || upper.includes(r.name.toUpperCase())) ?? null
}
