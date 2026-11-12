// Order drawdown — the pure, Prisma-free merge of a product recipe explosion
// with the customer's selected product-option drawdowns.
//
// This COMPUTES the stock an order implies; it never writes a count. Posting a
// deduction is a separate feature (#116) that will consume this result.
//
// A choice's drawdown (`MenuItemOptionChoice.inventoryItemId` + `qty` + `uomId`)
// mirrors a serve: selecting the choice additively draws that stock item.
// Unmapped choices (no inventory item, no qty) are a no-op. Quantities are
// canonicalised exactly like `explodeRecipe` — grams when the item has a
// density / unit-weight bridge, else base units — so the two add up.

import { canonicalQty, type ItemLike, type UomLike } from './unit-convert'

export interface DrawdownChoice {
  inventoryItemId?: string | null
  /** Quantity of the stock item drawn by ONE sold unit of the product. */
  qty?: number | null
  uom?: UomLike | null
  /** Density / unit-weight bridge used for gram-aware canonicalisation. */
  item?: ItemLike | null
}

const BASE_UOM: UomLike = { id: '', name: '', baseUnit: '', conversionRatio: 1 }

/** The canonical base quantity a single choice contributes (0 when unmapped). */
export function choiceDrawdownQty(choice: DrawdownChoice, multiplier = 1): number {
  if (!choice.inventoryItemId) return 0
  const qty = Number(choice.qty)
  if (!Number.isFinite(qty) || qty <= 0) return 0
  const base = canonicalQty(qty * multiplier, choice.uom ?? BASE_UOM, choice.item ?? null)
  return Number.isFinite(base) && base > 0 ? base : 0
}

/**
 * Merge a base drawdown (a recipe explosion, or an empty map) with every
 * selected choice's drawdown. Returns a new map — the input is not mutated.
 */
export function mergeDrawdown(
  base: ReadonlyMap<string, number>,
  choices: readonly DrawdownChoice[],
  multiplier = 1,
): Map<string, number> {
  const out = new Map(base)

  for (const choice of choices) {
    if (!choice.inventoryItemId) continue
    const qty = choiceDrawdownQty(choice, multiplier)
    if (qty <= 0) continue
    out.set(choice.inventoryItemId, (out.get(choice.inventoryItemId) ?? 0) + qty)
  }

  return out
}
