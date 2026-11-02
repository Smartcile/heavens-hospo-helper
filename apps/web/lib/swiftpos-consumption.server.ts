// Stock drawdown from SwiftPOS sales — the consumption step.
//
// For each matched sale, expand the product's serves: a MADE serve explodes its
// recipe (lib/inventory-engine.ts `explodeRecipe`); a POURED / DRAUGHT / BOTTLED
// / WINE serve draws `qty × serve.qty` of its stock item. Everything is
// canonicalised the same way explodeRecipe is (grams when the item has density /
// unit weight, else base units) so the totals agree with recipe costing.
//
// Prisma-backed — never import from a client component. See MENUS.md §8.

import { prisma } from '@hospo-ops/db'
import { explodeRecipe } from '@/lib/inventory-engine'
import { canonicalQty, type ItemLike, type UomLike } from '@/lib/unit-convert'
import { matchSalesToItems, type SwiftPosSale } from '@/lib/swiftpos'

export interface DrawdownRow {
  inventoryItemId: string
  name: string
  /** Required quantity in `unit`. */
  qty: number
  unit: 'G' | 'KG' | 'BASE'
  /** On-hand (physical count). */
  currentQty: number
  /** currentQty − qty (negative = would go short). BASE-unit items only. */
  variance: number | null
}

export interface ConsumptionResult {
  matchedQty: number
  totalQty: number
  unmatched: SwiftPosSale[]
  drawdown: DrawdownRow[]
  /** Products/serves that could not be expanded (missing serve, bad recipe). */
  errors: string[]
}

export async function computeSwiftPosConsumption(
  venueId: string,
  sales: SwiftPosSale[],
): Promise<ConsumptionResult> {
  const items = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: {
      id: true,
      name: true,
      swiftPosId: true,
      serves: {
        where: { deletedAt: null },
        select: {
          recipeId: true,
          inventoryItemId: true,
          qty: true,
          uom: { select: { id: true, name: true, baseUnit: true, conversionRatio: true, kind: true } },
          inventoryItem: { select: { id: true, densityGramsPerMl: true, weightPerUnitGrams: true } },
        },
      },
    },
  })

  const match = matchSalesToItems(sales, items)
  const byId = new Map(items.map((i) => [i.id, i]))
  const tally = new Map<string, number>()
  const errors: string[] = []

  for (const sale of match.matched) {
    const item = sale.itemId ? byId.get(sale.itemId) : null
    if (!item) continue
    if (item.serves.length === 0) {
      errors.push(`${item.name} — NO SERVES (nothing to consume)`)
      continue
    }
    for (const s of item.serves) {
      const draws = sale.qty * (s.qty || 1)
      if (s.inventoryItemId && s.uom) {
        const add = canonicalQty(draws, s.uom as unknown as UomLike, s.inventoryItem as ItemLike | null)
        tally.set(s.inventoryItemId, (tally.get(s.inventoryItemId) ?? 0) + add)
      } else if (s.recipeId) {
        try {
          const sub = await explodeRecipe(s.recipeId, draws, prisma)
          for (const [id, q] of sub) tally.set(id, (tally.get(id) ?? 0) + q)
        } catch (e) {
          errors.push(`${item.name} — ${(e as Error).message}`)
        }
      } else {
        errors.push(`${item.name} — A SERVE HAS NO TARGET`)
      }
    }
  }

  const drawdown: DrawdownRow[] = []
  for (const [id, qty] of tally) {
    const it = await prisma.inventoryItem.findUnique({
      where: { id },
      select: { name: true, totalQty: true, densityGramsPerMl: true, weightPerUnitGrams: true },
    })
    const bridged = it?.densityGramsPerMl != null || it?.weightPerUnitGrams != null
    drawdown.push({
      inventoryItemId: id,
      name: it?.name ?? 'Unknown',
      qty,
      unit: bridged ? (qty >= 1000 ? 'KG' : 'G') : 'BASE',
      currentQty: it?.totalQty ?? 0,
      // On-hand is a COUNT (physical units); only comparable to BASE (ea) items.
      variance: bridged ? null : (it?.totalQty ?? 0) - qty,
    })
  }
  drawdown.sort((a, b) => a.name.localeCompare(b.name))

  return {
    matchedQty: match.matchedQty,
    totalQty: match.totalQty,
    unmatched: match.unmatched,
    drawdown,
    errors,
  }
}
