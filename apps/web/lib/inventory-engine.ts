import { PrismaClient } from '@prisma/client'
import { toGrams } from '@/lib/unit-convert'

/**
 * explodeRecipe — recursive BOM explosion.
 *
 * Returns a Map<inventoryItemId, qty> where the qty is canonicalised PER ITEM:
 *  - an item with density data (densityGramsPerMl or weightPerUnitGrams)
 *    reports GRAMS — every line for it routes through toGrams, so a recipe
 *    using both 1 CUP and 500 G of the same item sums correctly instead of
 *    adding mL to g;
 *  - an item with no density keeps the legacy base-unit sum
 *    (qty × uom.conversionRatio — mL for volume bases, g for mass bases).
 *
 * A line that cannot convert (e.g. a COUNT line on an item that only has a
 * density) falls back to the base-unit figure rather than being dropped.
 */
export async function explodeRecipe(
  recipeId: string,
  quantityMultiplier: number,
  prisma: PrismaClient,
  visitedRecipeIds: Set<string> = new Set(),
): Promise<Map<string, number>> {
  if (visitedRecipeIds.has(recipeId)) {
    throw new Error(`Circular recipe reference: ${recipeId}`)
  }
  visitedRecipeIds.add(recipeId)

  const recipe = await prisma.recipe.findUniqueOrThrow({
    where: { id: recipeId },
    include: {
      yieldUnit: true,
      lineItems: {
        include: {
          uom: true,
          inventoryItem: true,
          childRecipe: { include: { yieldUnit: true } },
          ingredientReference: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  const result = new Map<string, number>()

  for (const li of recipe.lineItems) {
    // Pantry-bible lines (IngredientReference) are knowledge, not stock —
    // they carry density/unit-weight but no inventory row, so they never
    // participate in stock explosion.
    if (li.ingredientReferenceId) continue

    const lineBaseQty = li.qty * quantityMultiplier * li.uom.conversionRatio

    if (li.inventoryItemId) {
      if (lineBaseQty > 0) {
        const item = li.inventoryItem
        const hasBridge = !!item && (item.densityGramsPerMl != null || item.weightPerUnitGrams != null)
        const grams = hasBridge ? toGrams(li.qty * quantityMultiplier, li.uom, item) : null
        const addend = grams != null ? grams : lineBaseQty
        const current = result.get(li.inventoryItemId) ?? 0
        result.set(li.inventoryItemId, current + addend)
      }
    } else if (li.childRecipeId && li.childRecipe) {
      const subYieldBase = li.childRecipe.yieldQty * li.childRecipe.yieldUnit.conversionRatio
      const subMultiplier = lineBaseQty / subYieldBase

      const subResult = await explodeRecipe(
        li.childRecipeId,
        subMultiplier,
        prisma,
        new Set(visitedRecipeIds),
      )
      for (const [itemId, qty] of subResult) {
        const current = result.get(itemId) ?? 0
        result.set(itemId, current + qty)
      }
    }
  }

  return result
}

export type ExplodedIngredient = {
  inventoryItemId: string
  requiredBaseQty: number
}
