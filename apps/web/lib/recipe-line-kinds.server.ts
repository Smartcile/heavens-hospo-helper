// Server-side guard for recipe line units — enforces the "unit consistency"
// rule (Volume↔Volume, Mass↔Mass, Count↔Count, with density / unit-weight
// bridges). Called by the recipe POST/PUT routes so a line saved with an
// incompatible unit is rejected instead of silently mis-costed/mis-exploded.
// Prisma-backed — never import from a client component. See MENUS.md.

import { prisma } from '@hospo-ops/db'
import {
  allowedKinds,
  resolveItemKind,
  uomKind,
  type KindedItemLike,
  type UomLike,
} from '@/lib/unit-convert'

interface LineInput {
  uomId?: string | null
  inventoryItemId?: string | null
  childRecipeId?: string | null
  ingredientReferenceId?: string | null
}

/**
 * Returns an error message when any line's unit dimension is incompatible with
 * its target, else null. Pantry lines and unresolved targets are skipped (there
 * is nothing to enforce). Never throws — callers treat a throw as pass.
 */
export async function checkRecipeLineUnits(lineItems: unknown): Promise<string | null> {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return null
  const lines = lineItems as LineInput[]

  const invIds = [...new Set(lines.map((l) => l.inventoryItemId).filter((x): x is string => !!x))]
  const recIds = [...new Set(lines.map((l) => l.childRecipeId).filter((x): x is string => !!x))]
  const uomIds = [...new Set(lines.map((l) => l.uomId).filter((x): x is string => !!x))]

  const [invs, recs, uoms] = await Promise.all([
    invIds.length
      ? prisma.inventoryItem.findMany({
          where: { id: { in: invIds } },
          select: {
            id: true,
            unit: true,
            densityGramsPerMl: true,
            weightPerUnitGrams: true,
            countingUnit: { select: { kind: true } },
          },
        })
      : [],
    recIds.length
      ? prisma.recipe.findMany({
          where: { id: { in: recIds } },
          select: { id: true, name: true, yieldUnit: { select: { kind: true } } },
        })
      : [],
    uomIds.length
      ? prisma.unitOfMeasure.findMany({
          where: { id: { in: uomIds } },
          select: { id: true, name: true, baseUnit: true, conversionRatio: true, kind: true },
        })
      : [],
  ])

  const uomsList = uoms as unknown as UomLike[]
  const uomsById = new Map(uoms.map((u) => [u.id, u as unknown as UomLike]))
  const invById = new Map(invs.map((i) => [i.id, i]))
  const recById = new Map(recs.map((r) => [r.id, r]))

  for (const l of lines) {
    if (l.ingredientReferenceId) continue
    const uom = l.uomId ? uomsById.get(l.uomId) : undefined
    if (!uom) continue

    let target: KindedItemLike | null = null
    let targetName = ''
    if (l.inventoryItemId) {
      const inv = invById.get(l.inventoryItemId)
      if (!inv) continue
      const kind =
        (inv.countingUnit?.kind as string | null) ?? resolveItemKind(inv.unit, uomsList)
      target = {
        kind,
        densityGramsPerMl: inv.densityGramsPerMl,
        weightPerUnitGrams: inv.weightPerUnitGrams,
      }
      targetName = inv.unit || 'the stock item'
    } else if (l.childRecipeId) {
      const rec = recById.get(l.childRecipeId)
      if (!rec) continue
      target = { kind: (rec.yieldUnit?.kind as string | null) ?? null }
      targetName = rec.name
    } else {
      continue
    }

    if (!allowedKinds(target).has(uomKind(uom))) {
      return `UNIT MISMATCH — "${targetName}" is ${target.kind ?? 'an unmatched type'}, but "${uom.name}" is ${uomKind(uom)}. USE A UNIT OF THE SAME TYPE, OR ADD A DENSITY / UNIT WEIGHT TO BRIDGE IT.`
    }
  }
  return null
}
