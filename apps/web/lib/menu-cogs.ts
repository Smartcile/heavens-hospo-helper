// COGS — the pure, Prisma-free brain that turns an exploded recipe (or a serve
// spec) into a dollar cost, and the cost against a GST-inclusive menu price.
//
// Convention: `InventoryItem.costPrice` is the price for ONE `InventoryItem.unit`
// (e.g. $8.50 per KILOGRAM, $5.20 per LITRE, $0.45 per EACH). `explodeRecipe`
// reports each ingredient canonically — GRAMS when the item has a density / unit
// weight bridge, otherwise the base unit of the line's dimension (mL / g / ea).

import { uomKind, canonicalQty, type UomLike } from '@/lib/unit-convert'

export const NZ_GST_RATE = 0.15

export interface CogsInventoryItem {
  id: string
  unit: string | null
  costPrice: number | null
  densityGramsPerMl?: number | null
  weightPerUnitGrams?: number | null
}

export interface CogsResult {
  cost: number
  /** True when at least one ingredient had no cost price — the figure is a floor. */
  partial: boolean
}

/** A GST-inclusive price → the ex-GST figure (NZ default 15%). */
export function priceExGst(price: number, rate: number = NZ_GST_RATE): number {
  const n = Number(price)
  if (!Number.isFinite(n)) return 0
  return n / (1 + rate)
}

/** Gross margin % of the ex-GST price. Null when there is no price to compare. */
export function grossMarginPct(cost: number, exGstPrice: number): number | null {
  if (!Number.isFinite(cost) || !Number.isFinite(exGstPrice) || exGstPrice <= 0) return null
  return ((exGstPrice - cost) / exGstPrice) * 100
}

/** Find the UOM that an item's `unit` string names (exact name, then base unit). */
export function resolveCostUom(unit: string | null | undefined, uoms: UomLike[]): UomLike | null {
  if (!unit) return null
  const u = unit.toUpperCase().trim()
  return (
    uoms.find((x) => x.name.toUpperCase() === u) ??
    uoms.find((x) => (x.baseUnit || '').toUpperCase() === u) ??
    null
  )
}

/**
 * Cost of `canonicalQty` of an item, where canonicalQty is grams (bridged item)
 * or the base unit of the item's own dimension (mL / g / ea). Returns null when
 * the item has no cost price or the unit cannot be resolved.
 */
export function costOfCanonicalQty(
  canonicalQtyValue: number,
  item: CogsInventoryItem | null | undefined,
  uoms: UomLike[],
): number | null {
  if (!item || item.costPrice == null || !item.unit) return null
  if (!Number.isFinite(canonicalQtyValue) || canonicalQtyValue <= 0) return 0
  const costUom = resolveCostUom(item.unit, uoms)
  if (!costUom) return null
  const ratio = costUom.conversionRatio || 1
  const kind = uomKind(costUom)
  const bridged = item.densityGramsPerMl != null || item.weightPerUnitGrams != null

  // Not bridged: canonicalQty is already the base of the item's own kind, which
  // is the cost UOM's kind — one ratio step is all that is needed.
  if (!bridged) return (canonicalQtyValue * item.costPrice) / ratio

  // Bridged: canonicalQty is grams.
  if (kind === 'MASS') return (canonicalQtyValue * item.costPrice) / ratio
  if (kind === 'VOLUME') {
    if (!item.densityGramsPerMl) return null
    return ((canonicalQtyValue / item.densityGramsPerMl) * item.costPrice) / ratio
  }
  if (!item.weightPerUnitGrams) return null
  return ((canonicalQtyValue / item.weightPerUnitGrams) * item.costPrice) / ratio
}

/** Sum the cost of an exploded recipe. `partial` flags any unpriced ingredient. */
export function costExploded(
  entries: { id: string; qty: number }[],
  index: ReadonlyMap<string, CogsInventoryItem>,
  uoms: UomLike[],
): CogsResult {
  let cost = 0
  let partial = false
  for (const e of entries) {
    const c = costOfCanonicalQty(e.qty, index.get(e.id), uoms)
    if (c == null) partial = true
    else cost += c
  }
  return { cost, partial }
}

/** Cost of one serve of a stock item (`qty` in `uom`). Null when uncostable. */
export function costOfServe(
  qty: number,
  uom: UomLike | null | undefined,
  item: CogsInventoryItem | null | undefined,
  uoms: UomLike[],
): number | null {
  if (!uom || !item) return null
  return costOfCanonicalQty(canonicalQty(qty, uom, item), item, uoms)
}
