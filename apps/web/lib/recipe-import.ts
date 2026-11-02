// WooCommerce-imported products surface in the Recipes page behind an
// "IMPORT PRODUCTS" popup rather than cluttering the recipe list. These are
// the gaps the operator fills while turning a synced product into a recipe.

export interface ImportableProduct {
  price: number | null
  wooCategoryId: string | null
  dietaryInfo: string | null
  imageUrl: string | null
  shortDescription: string | null
}

export interface ImportFieldGap {
  key: string
  label: string
}

/** Product fields that are empty and worth filling before the recipe is used. */
export function missingProductFields(p: ImportableProduct): ImportFieldGap[] {
  const gaps: ImportFieldGap[] = []
  if (p.price == null || p.price <= 0) gaps.push({ key: 'price', label: 'PRICE' })
  if (!p.wooCategoryId) gaps.push({ key: 'category', label: 'MENU / CATEGORY' })
  if (!p.dietaryInfo) gaps.push({ key: 'dietary', label: 'ALLERGENS' })
  if (!p.imageUrl) gaps.push({ key: 'image', label: 'IMAGE' })
  if (!p.shortDescription) gaps.push({ key: 'description', label: 'SHORT DESCRIPTION' })
  return gaps
}
