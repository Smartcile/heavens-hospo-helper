import { prisma } from '@hospo-ops/db'
import { pushProduct } from '@/lib/woo-push'

// ── Menu Item ⇄ Menu Category Sync ────────────────────────────────────
// Invariant: a MenuItem's wooCategoryId mirrors the categories of the menus
// it is on (comma-joined). Menu edits and link/unlink flows call
// syncMenuItemCategory so the store stays in step. All best-effort — never
// throws into a request handler.
// ──────────────────────────────────────────────────────────────────────

/** Pure set diff over the item ids in a menu edit: what was added, what was removed. */
export function diffItemIds(prev: string[], next: string[]): { added: string[]; removed: string[] } {
  const prevSet = new Set(prev)
  const nextSet = new Set(next)
  return {
    added: next.filter((id) => !prevSet.has(id)),
    removed: prev.filter((id) => !nextSet.has(id)),
  }
}

/** The comma-joined category ids a menu item should carry, from its live menus. */
export function unionCategoryIds(menus: { wooCategoryId: string | null }[]): string | null {
  const cats = [...new Set(menus.map((m) => m.wooCategoryId).filter((c): c is string => !!c))]
  return cats.length > 0 ? cats.join(', ') : null
}

/**
 * Recompute a menu item's wooCategoryId from its live menu memberships and
 * push the change to WooCommerce — but only when the value actually changed
 * (a reorder shouldn't fire a pointless push) and only when the item has a
 * WooCommerce product to push to (a local-only item must not trigger the
 * create-on-missing fallback).
 */
export async function syncMenuItemCategory(itemId: string): Promise<void> {
  try {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId },
      select: { id: true, venueId: true, wooProductId: true, wooCategoryId: true },
    })
    if (!item) return

    const menus = await prisma.menu.findMany({
      where: { venueId: item.venueId, deletedAt: null, items: { some: { menuItemId: itemId } } },
      select: { wooCategoryId: true },
    })

    const next = unionCategoryIds(menus)
    if (next === item.wooCategoryId) return
    await prisma.menuItem.update({ where: { id: itemId }, data: { wooCategoryId: next } })
    if (item.wooProductId) await pushProduct(itemId)
  } catch (e) {
    console.error('syncMenuItemCategory failed (non-blocking):', e)
  }
}
