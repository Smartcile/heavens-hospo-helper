export const ALLERGENS = [
  'ALMOND', 'BARLEY', 'BRAZIL NUT', 'CASHEW', 'CRUSTACEAN',
  'EGG', 'FISH', 'GLUTEN', 'HAZELNUT', 'LUPIN', 'MACADAMIA',
  'MILK', 'MOLLUSC', 'OATS', 'PEANUT', 'PECAN',
  'PINE NUT', 'PISTACHIO', 'RYE', 'SESAME', 'SOY',
  'SULPHITES', 'WALNUT', 'WHEAT',
] as const

export type Allergen = (typeof ALLERGENS)[number]

export interface AllergenSource {
  allergen: Allergen
  source: string // e.g. "WHEAT FLOUR" or "WHEAT FLOUR → PASTA DOUGH"
  inherited: boolean // true if from an ingredient, false if manually added
}

/**
 * Parse a comma-separated allergy string into a clean allergen array.
 * Used for reading InventoryItem.allergyInfo and MenuItem.dietaryInfo.
 */
export function parseAllergens(raw: string | null | undefined): Allergen[] {
  if (!raw || !raw.trim()) return []
  return raw
    .toUpperCase()
    .split(',')
    .map((a) => a.trim())
    .filter((a) => ALLERGENS.includes(a as Allergen)) as Allergen[]
}

/**
 * Join allergens back to a comma-separated string for storage.
 */
export function formatAllergens(allergens: Allergen[]): string {
  return [...new Set(allergens)].join(', ')
}

/**
 * Compute allergens for a recipe by walking its line items.
 * Each inventory ingredient contributes its allergens with source tracking.
 * Sub-recipes are recursed into.
 *
 * Returns both the inherited allergens (from ingredients) and any
 * manually-added allergens stored on the recipe itself.
 */
export function computeRecipeAllergens(
  lineItems: { type: 'inventory' | 'recipe'; item: { id: string; name: string; allergyInfo: string | null }; recipeAllergens?: AllergenSource[] }[],
  recipeDirectAllergens: string | null,
): AllergenSource[] {
  const sources: AllergenSource[] = []

  for (const li of lineItems) {
    if (li.type === 'inventory' && li.item.allergyInfo) {
      for (const a of parseAllergens(li.item.allergyInfo)) {
        // Check if this allergen already exists from this same source
        if (!sources.some((s) => s.allergen === a && s.source === li.item.name)) {
          sources.push({ allergen: a, source: li.item.name, inherited: true })
        }
      }
    }
    if (li.type === 'recipe' && li.recipeAllergens) {
      for (const src of li.recipeAllergens) {
        const extendedSource = `${src.source} → ${li.item.name}`
        if (!sources.some((s) => s.allergen === src.allergen && s.source === extendedSource)) {
          sources.push({ allergen: src.allergen, source: extendedSource, inherited: true })
        }
      }
    }
  }

  // Add manually-added allergens (if any)
  if (recipeDirectAllergens) {
    for (const a of parseAllergens(recipeDirectAllergens)) {
      if (!sources.some((s) => s.allergen === a && !s.inherited)) {
        sources.push({ allergen: a, source: 'ADDED DIRECTLY', inherited: false })
      }
    }
  }

  return sources
}

/**
 * Build a hover tooltip for an allergen showing its full source chain.
 */
export function allergenTooltip(source: AllergenSource): string {
  if (!source.inherited) return `ADDED DIRECTLY TO THIS RECIPE`
  return `FROM: ${source.source}`
}
