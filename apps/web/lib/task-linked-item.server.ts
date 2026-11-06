import { prisma } from '@hospo-ops/db'

// The shape both task editors need: the item plus its storage locations.
// The client renders it with lib/item-location.ts.
export const linkedItemSelect = {
  id: true,
  name: true,
  unit: true,
  storageNotes: true,
  deletedAt: true,
  storageLocations: {
    where: { deletedAt: null },
    select: {
      notes: true,
      section: {
        select: {
          name: true,
          department: { select: { name: true } },
        },
      },
    },
  },
} as const

/**
 * Rejects a link that points at another venue (or a soft-deleted item).
 * `currentLinkedItemId` lets an unchanged existing link survive even after the
 * item was soft-deleted, so a stale link never blocks every future task save.
 */
export async function linkedItemError(
  venueId: string,
  linkedItemId: string | null | undefined,
  currentLinkedItemId?: string | null,
): Promise<string | null> {
  if (!linkedItemId) return null
  if (currentLinkedItemId && String(linkedItemId) === String(currentLinkedItemId)) return null
  const item = await prisma.inventoryItem.findFirst({
    where: { id: String(linkedItemId), venueId, deletedAt: null },
    select: { id: true },
  })
  return item ? null : 'LINKED ITEM IS NOT IN THIS VENUE'
}
