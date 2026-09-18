// Pure event pricing. The MENU_SELECTION and DRINKS_SELECTION blocks carry
// `items: [{ menuItemId, qty }]`; this sums them against live MenuItem prices so
// the event, its PDF and its customer share page can show a total and balance.
// Prisma-free — the caller passes the menu items in.

export interface EventBlockLike {
  type: string
  config?: Record<string, unknown> | null
}

export interface PriceableLine {
  menuItemId: string
  qty: number
}

export interface MenuPrice {
  id: string
  name: string
  price: number
}

export interface EventPriceLine {
  menuItemId: string
  name: string
  qty: number
  unitPrice: number
  total: number
}

export interface EventTotals {
  lines: EventPriceLine[]
  subtotal: number
  deposit: number
  balance: number
}

/** Blocks whose items are priced. */
export const PRICED_BLOCK_TYPES = ['MENU_SELECTION', 'DRINKS_SELECTION']

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Every priced line across the menu + drinks blocks, merging duplicate menu
 * items (the same dish on both blocks is one line, summed).
 */
export function collectEventItems(blocks: EventBlockLike[] | null | undefined): PriceableLine[] {
  const merged = new Map<string, number>()
  for (const block of blocks ?? []) {
    if (!PRICED_BLOCK_TYPES.includes(block.type)) continue
    const items = block.config?.items
    if (!Array.isArray(items)) continue
    for (const raw of items) {
      const it = raw as { menuItemId?: unknown; qty?: unknown } | null
      const id = typeof it?.menuItemId === 'string' ? it.menuItemId : ''
      if (!id) continue
      const qty = Number(it?.qty)
      if (!Number.isFinite(qty) || qty <= 0) continue
      merged.set(id, (merged.get(id) ?? 0) + qty)
    }
  }
  return [...merged.entries()].map(([menuItemId, qty]) => ({ menuItemId, qty }))
}

/**
 * Price the event. Items with no matching menu item are skipped rather than
 * priced at zero — a purged product should not silently appear as free.
 */
export function computeEventTotals(
  blocks: EventBlockLike[] | null | undefined,
  menuItems: MenuPrice[],
  deposit: number | null | undefined,
): EventTotals {
  const byId = new Map(menuItems.map((m) => [m.id, m]))
  const lines: EventPriceLine[] = []

  for (const item of collectEventItems(blocks)) {
    const menuItem = byId.get(item.menuItemId)
    if (!menuItem) continue
    const unitPrice = Number(menuItem.price) || 0
    lines.push({
      menuItemId: item.menuItemId,
      name: menuItem.name,
      qty: item.qty,
      unitPrice,
      total: round2(unitPrice * item.qty),
    })
  }

  const subtotal = round2(lines.reduce((sum, l) => sum + l.total, 0))
  const dep = round2(Math.max(0, Number(deposit) || 0))
  return { lines, subtotal, deposit: dep, balance: round2(subtotal - dep) }
}
