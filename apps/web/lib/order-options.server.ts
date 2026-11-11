// Server half of the order-option model: loads a product's LIVE option groups
// (venue-scoped) so the order routes can re-validate a submitted selection and
// price it from the real upcharges. The pure rules live in `order-options.ts`.

import { prisma } from '@hospo-ops/db'
import { normaliseOptionGroups, type MenuOptionGroup } from './menu-options'

export interface LoadedOptionGroups {
  groupsByItem: Map<string, MenuOptionGroup[]>
  /** Requested product ids that are missing, deleted or belong to another venue. */
  missingItemIds: string[]
}

/**
 * Load every live option group for the requested products in a fixed number of
 * queries (one for the products, one for the groups + choices).
 */
export async function loadOptionGroupsForItems(
  menuItemIds: readonly string[],
  venueId: string,
): Promise<LoadedOptionGroups> {
  const ids = [...new Set(menuItemIds.filter(Boolean))]
  if (ids.length === 0) return { groupsByItem: new Map(), missingItemIds: [] }

  const items = await prisma.menuItem.findMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      // Own products, or products shared into this venue via MenuItemVenue.
      OR: [{ venueId }, { venueShares: { some: { venueId, isActive: true } } }],
    },
    select: { id: true },
  })
  const valid = new Set(items.map((i) => i.id))
  const missingItemIds = ids.filter((id) => !valid.has(id))

  const rows = valid.size
    ? await prisma.menuItemOptionGroup.findMany({
        where: { menuItemId: { in: [...valid] }, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          choices: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        },
      })
    : []

  const groupsByItem = new Map<string, MenuOptionGroup[]>()
  for (const row of rows) {
    const [group] = normaliseOptionGroups([row])
    if (!group) continue
    const list = groupsByItem.get(row.menuItemId) ?? []
    list.push(group)
    groupsByItem.set(row.menuItemId, list)
  }

  return { groupsByItem, missingItemIds }
}
