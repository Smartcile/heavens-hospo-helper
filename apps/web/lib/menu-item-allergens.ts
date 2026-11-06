import { computeRecipeAllergens, type AllergenSource } from './allergens'

interface RecipeAllergenLine {
  inventoryItem?: { id: string; name: string; allergyInfo: string | null } | null
  childRecipe?: { id: string; name: string } | null
}

/** Allergens derived from a product's attached recipe line items. */
export function inheritedAllergensFromRecipe(
  recipe: { lineItems?: RecipeAllergenLine[] | null } | null | undefined,
): AllergenSource[] {
  const lineItems = recipe?.lineItems ?? []
  if (lineItems.length === 0) return []
  return computeRecipeAllergens(
    lineItems.map((line) => {
      if (line.inventoryItem) {
        return {
          type: 'inventory' as const,
          item: line.inventoryItem,
        }
      }
      return {
        type: 'recipe' as const,
        item: {
          id: line.childRecipe?.id ?? '',
          name: line.childRecipe?.name ?? '',
          allergyInfo: null,
        },
      }
    }),
    null,
  ).filter((source) => source.inherited)
}
