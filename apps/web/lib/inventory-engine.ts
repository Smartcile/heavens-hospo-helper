import { PrismaClient } from '@prisma/client'

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
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  const result = new Map<string, number>()

  for (const li of recipe.lineItems) {
    const lineBaseQty = li.qty * quantityMultiplier * li.uom.conversionRatio

    if (li.inventoryItemId) {
      if (lineBaseQty > 0) {
        const current = result.get(li.inventoryItemId) ?? 0
        result.set(li.inventoryItemId, current + lineBaseQty)
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
