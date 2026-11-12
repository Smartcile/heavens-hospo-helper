// Server half of the order drawdown (#118). Resolves each selected choice's
// optional stock drawdown from the live `MenuItemOptionChoice` rows so the
// reconcile path can add it to the recipe explosion. Read-only — nothing here
// mutates stock (posting a deduction belongs to #116).

import { prisma } from '@hospo-ops/db'
import type { DrawdownChoice } from './order-drawdown'

/** Load the drawdown mapping for the given choice ids in one query. */
export async function loadChoiceDrawdowns(
  choiceIds: readonly string[],
): Promise<Map<string, DrawdownChoice>> {
  const ids = [...new Set(choiceIds.filter(Boolean))]
  if (ids.length === 0) return new Map()

  const rows = await prisma.menuItemOptionChoice.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      inventoryItemId: true,
      qty: true,
      uom: { select: { id: true, name: true, baseUnit: true, conversionRatio: true, kind: true } },
      inventoryItem: { select: { densityGramsPerMl: true, weightPerUnitGrams: true } },
    },
  })

  const map = new Map<string, DrawdownChoice>()
  for (const row of rows) {
    map.set(row.id, {
      inventoryItemId: row.inventoryItemId,
      qty: row.qty,
      uom: row.uom,
      item: row.inventoryItem,
    })
  }
  return map
}
