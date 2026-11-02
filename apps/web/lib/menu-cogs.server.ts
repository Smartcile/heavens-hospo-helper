import { prisma } from '@hospo-ops/db'
import { explodeRecipe } from '@/lib/inventory-engine'
import { costExploded, costOfServe, type CogsInventoryItem, type CogsResult } from '@/lib/menu-cogs'
import type { UomLike } from '@/lib/unit-convert'

async function loadInventoryIndex(ids: string[]): Promise<Map<string, CogsInventoryItem>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (uniq.length === 0) return new Map()
  const rows = await prisma.inventoryItem.findMany({
    where: { id: { in: uniq }, deletedAt: null },
    select: { id: true, unit: true, costPrice: true, densityGramsPerMl: true, weightPerUnitGrams: true },
  })
  return new Map(rows.map((r) => [r.id, r]))
}

/**
 * COGS per product, keyed by MenuItem id. A product with a recipe is costed from
 * its exploded BOM per yield unit; otherwise its first serve (a stock pour or a
 * recipe) is costed. Null when nothing can be priced.
 */
export async function cogsForMenuItems(
  menuItemIds: string[],
  venueId?: string | null,
): Promise<Record<string, CogsResult | null>> {
  const ids = [...new Set(menuItemIds.filter(Boolean))]
  const out: Record<string, CogsResult | null> = {}
  if (ids.length === 0) return out

  const items = await prisma.menuItem.findMany({
    where: { id: { in: ids }, deletedAt: null, ...(venueId ? { venueId } : {}) },
    select: {
      id: true,
      recipeId: true,
      serves: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { recipeId: true, inventoryItemId: true, qty: true, uomId: true },
      },
    },
  })

  const uoms = (await prisma.unitOfMeasure.findMany({
    where: { deletedAt: null, ...(venueId ? { OR: [{ venueId: null }, { venueId }] } : {}) },
    select: { id: true, name: true, baseUnit: true, conversionRatio: true, kind: true },
  })) as UomLike[]

  const recipeCache = new Map<string, CogsResult | null>()

  async function recipePerUnit(recipeId: string): Promise<CogsResult | null> {
    if (recipeCache.has(recipeId)) return recipeCache.get(recipeId)!
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { yieldQty: true } })
    if (!recipe) {
      recipeCache.set(recipeId, null)
      return null
    }
    let exploded: Map<string, number>
    try {
      exploded = await explodeRecipe(recipeId, 1, prisma)
    } catch {
      recipeCache.set(recipeId, null)
      return null
    }
    const entries = [...exploded].map(([id, qty]) => ({ id, qty }))
    const index = await loadInventoryIndex(entries.map((e) => e.id))
    const res = costExploded(entries, index, uoms)
    const value: CogsResult = { cost: res.cost / (recipe.yieldQty || 1), partial: res.partial }
    recipeCache.set(recipeId, value)
    return value
  }

  const serveItemIds = items.flatMap((i) =>
    i.serves.map((s) => s.inventoryItemId).filter((x): x is string => !!x),
  )
  const serveIndex = await loadInventoryIndex(serveItemIds)

  for (const it of items) {
    if (it.recipeId) {
      out[it.id] = await recipePerUnit(it.recipeId)
      continue
    }
    const serve = it.serves[0]
    if (!serve) {
      out[it.id] = null
      continue
    }
    if (serve.recipeId) {
      out[it.id] = await recipePerUnit(serve.recipeId)
      continue
    }
    if (serve.inventoryItemId) {
      const invItem = serveIndex.get(serve.inventoryItemId) ?? null
      const uom = serve.uomId ? uoms.find((u) => u.id === serve.uomId) ?? null : null
      const cost = costOfServe(serve.qty, uom, invItem, uoms)
      out[it.id] = cost == null ? null : { cost, partial: false }
      continue
    }
    out[it.id] = null
  }

  return out
}
