// Menu line + size options — the pure, Prisma-free brain shared by the menu
// builder, the live plain-text preview and the server. A menu line is either a
// PRODUCT (MenuItem, sizes read from its `variations`) or a STOCK item
// (InventoryItem, sizes carried on the line's `sizeOptions`). See MENUS.md.

export type MenuLineKind = 'PRODUCT' | 'STOCK'

export interface MenuSize {
  label: string
  price: number
}

/** Normalise a raw size list (`[{ label|name, price }]`) to clean { label, price }. */
export function cleanSizes(raw: unknown): MenuSize[] {
  if (!Array.isArray(raw)) return []
  const out: MenuSize[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as { label?: unknown; name?: unknown; price?: unknown }
    const label = String(s.label ?? s.name ?? '').trim().toUpperCase()
    if (!label) continue
    const price = Number(s.price)
    out.push({ label, price: Number.isFinite(price) && price >= 0 ? price : 0 })
  }
  return out
}

/** Product sizes come from `MenuItem.variations` (`{ name, price, wooVariationId? }`). */
export function variationSizes(raw: unknown): MenuSize[] {
  if (!Array.isArray(raw)) return []
  return cleanSizes(raw.map((v) => ({ label: (v as { name?: unknown })?.name, price: (v as { price?: unknown })?.price })))
}

/** The sizes for a line, from whichever source its kind uses. */
export function lineSizes(line: { kind: MenuLineKind; variations?: unknown; sizeOptions?: unknown }): MenuSize[] {
  return line.kind === 'PRODUCT' ? variationSizes(line.variations) : cleanSizes(line.sizeOptions)
}

/** "12.5" → "12.50"; no currency symbol (the preview adds it). */
export function formatSizePrice(price: number): string {
  const n = Number(price)
  return (Number.isFinite(n) ? n : 0).toFixed(2)
}

export interface MenuLineLike {
  id: string
  kind: MenuLineKind
  groupId: string | null
  name: string
  price: number | null
  sizes: MenuSize[]
  isActive: boolean
  minQty: number | null
  maxQty: number | null
  sortOrder: number
  dietaryInfo?: string | null
}

/** The read shape of one menu line, as returned by the admin menu routes. */
export interface ShapedMenuLine extends MenuLineLike {
  menuItemId: string | null
  inventoryItemId: string | null
  imageUrl: string | null
  unit: string | null
}

/** A menu as returned by the admin menu routes (list + detail). */
export interface MenuShape {
  id: string
  name: string
  description: string | null
  minPax: number | null
  maxPax: number | null
  isActive: boolean
  wooCategoryId: string | null
  groups: { id: string; name: string; sortOrder: number }[]
  items: ShapedMenuLine[]
}

export interface MenuPreviewGroup {
  id: string | null
  name: string
  lines: MenuLineLike[]
}

/**
 * Group lines under their menu group (or an "UNGROUPED" bucket), each ordered by
 * sortOrder. Groups with no lines are dropped so the preview only shows what is
 * actually on the menu.
 */
export function groupMenuLines<T extends MenuLineLike>(
  groups: { id: string; name: string; sortOrder: number }[],
  lines: T[],
): { id: string | null; name: string; lines: T[] }[] {
  const ordered = [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({ id: g.id as string | null, name: g.name, lines: [] as T[] }))
  const byId = new Map(ordered.map((g) => [g.id as string, g]))
  const ungrouped: T[] = []

  for (const line of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const g = line.groupId ? byId.get(line.groupId) : undefined
    if (g) g.lines.push(line)
    else ungrouped.push(line)
  }

  const out = ordered.filter((g) => g.lines.length > 0)
  if (ungrouped.length) out.push({ id: null, name: 'UNGROUPED', lines: ungrouped })
  return out
}
