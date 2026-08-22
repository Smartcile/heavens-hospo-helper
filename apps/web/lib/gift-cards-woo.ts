// ── Gift Card ⇄ WooCommerce detection ──────────────────────────────────
// Pure decision logic for recognising gift card line items on a WooCommerce
// order. The primary signal is the venue's configured GIFT CARDS category
// (see Venue.giftCardWooCategoryId — same pattern as Menu.wooCategoryId).
// When NO category is configured, the legacy SKU heuristic applies so
// existing venues keep working untouched.
// ──────────────────────────────────────────────────────────────────────

/** The category name created on the store by the admin UI's CREATE helper. */
export const GIFT_CARD_CATEGORY_DEFAULT_NAME = 'GIFT CARDS'

/** Legacy heuristic: a line is a gift card when its SKU mentions GIFT. */
export function skuLooksLikeGiftCard(sku: string | null | undefined): boolean {
  return String(sku ?? '').toUpperCase().includes('GIFT')
}

export interface GiftCardLineInput {
  sku?: string | null
}

/**
 * Decide whether a WooCommerce line item is a gift card.
 *
 * - `giftCardCategoryId` set: the line is a gift card ONLY when its product's
 *   category set contains the configured category. An unresolved product
 *   (`productCategories: null`) is NOT a gift card — a category-configured
 *   venue never guesses.
 * - `giftCardCategoryId` null: legacy SKU heuristic (`skuLooksLikeGiftCard`).
 */
export function isGiftCardLine(
  line: GiftCardLineInput,
  giftCardCategoryId: string | null,
  productCategories: string[] | null,
): boolean {
  if (giftCardCategoryId) {
    if (productCategories === null) return false
    return productCategories.includes(giftCardCategoryId)
  }
  return skuLooksLikeGiftCard(line.sku)
}

/** Split a stored comma-joined `wooCategoryId` string into id strings. */
export function categoryIdsFromString(wooCategoryId: string | null | undefined): string[] {
  if (!wooCategoryId) return []
  return wooCategoryId
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
}
