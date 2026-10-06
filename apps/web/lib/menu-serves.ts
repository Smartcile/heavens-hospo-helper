// How a product is served / consumed — the app's POS item link.
//
// A POS button maps to a stock item OR a recipe, with a quantity + unit. We
// model that as `MenuItemServe`: a product (MenuItem) can carry several serves
// (tap beer 400ML / 1.4L, wine GLASS / CARAFE / BOTTLE), each pointing at one
// recipe or one stock item. The server half lives in the routes; this file is
// pure and Prisma-free so the editor, the reference table and the server can
// all agree on one definition. See MENUS.md.

export type ServeMethod = 'MADE' | 'DRAUGHT' | 'POURED' | 'BOTTLED' | 'WINE' | 'OTHER'

export const SERVE_METHODS: ServeMethod[] = ['MADE', 'DRAUGHT', 'POURED', 'BOTTLED', 'WINE', 'OTHER']

export const SERVE_METHOD_LABELS: Record<ServeMethod, string> = {
  MADE: 'MADE (RECIPE)',
  DRAUGHT: 'DRAUGHT',
  POURED: 'POURED',
  BOTTLED: 'BOTTLED / CANNED',
  WINE: 'WINE',
  OTHER: 'OTHER',
}

export function isServeMethod(value: unknown): value is ServeMethod {
  return typeof value === 'string' && (SERVE_METHODS as string[]).includes(value)
}

export type UomKind = 'VOLUME' | 'MASS' | 'COUNT'

export interface ServeInput {
  label?: string | null
  method?: ServeMethod | null
  recipeId?: string | null
  inventoryItemId?: string | null
  qty?: number | null
  uomId?: string | null
}

/** The shape needed to render / summarise a serve. */
export interface ServeLike {
  method: string | null
  label: string | null
  qty: number
  uom: { name: string } | null
  recipe: { name: string } | null
  inventoryItem: { name: string } | null
}

/** What a serve draws from — a recipe, a stock item, or nothing yet. */
export function serveTargetKind(s: {
  recipeId?: string | null
  inventoryItemId?: string | null
}): 'RECIPE' | 'STOCK' | null {
  if (s.recipeId) return 'RECIPE'
  if (s.inventoryItemId) return 'STOCK'
  return null
}

/**
 * Validate one serve. `targetKind` / `uomKind` are the unit kinds of the linked
 * stock item and chosen unit (undefined when unknown). A VOLUME serve on a
 * COUNT stock item (a bottle sold as a cup) is rejected — the rule the KB
 * spells out as "unit consistency".
 */
export function validateServe(
  s: ServeInput,
  opts: { targetKind?: UomKind | null; uomKind?: UomKind | null } = {},
): string | null {
  const target = serveTargetKind(s)
  if (s.recipeId && s.inventoryItemId) return 'A SERVE HAS ONE TARGET — A RECIPE OR A STOCK ITEM'
  if (!target) return 'PICK A RECIPE OR A STOCK ITEM'
  if (!(Number(s.qty) > 0)) return 'QUANTITY MUST BE GREATER THAN 0'
  if (target === 'STOCK') {
    if (!s.uomId) return 'PICK A UNIT FOR A POURED / BOTTLED SERVE'
    if (opts.targetKind && opts.uomKind && opts.targetKind !== opts.uomKind) {
      return `UNIT MISMATCH — STOCK IS ${opts.targetKind}, THE SERVE IS ${opts.uomKind}`
    }
  }
  return null
}

/** "400 ML", "1.4 L", "1 EA" — a quantity with its unit, trimmed. */
export function serveSizeLabel(qty: number, uomName: string | null): string {
  const n = Number(qty)
  const num = Number.isFinite(n) ? String(n) : String(qty)
  return (uomName ? `${num} ${uomName}` : num).toUpperCase()
}

/** The label + size for one serve, e.g. "400 ML" or "GLASS · 150 ML". */
export function serveSize(s: ServeLike): string {
  const bits = [s.label?.trim() || null, serveSizeLabel(s.qty, s.uom?.name ?? null)].filter(Boolean)
  return bits.join(' · ')
}

/** The full description including the target, for the editor's serve list. */
export function describeServe(s: ServeLike): string {
  const target = s.recipe?.name ?? s.inventoryItem?.name ?? 'NO TARGET'
  return `${serveSize(s)} · ${target}`
}

/** A " / "-joined size list across every serve, for a reference-table cell. */
export function summariseServes(serves: ServeLike[]): string | null {
  if (!serves.length) return null
  return serves.map(serveSize).join(' / ')
}

/** Distinct serve methods across the serves, e.g. "DRAUGHT, WINE". */
export function summariseMethods(serves: { method: string | null }[]): string | null {
  const seen = [...new Set(serves.map((s) => s.method).filter((m): m is string => !!m))]
  return seen.length ? seen.join(', ') : null
}

/**
 * Sanitise an incoming serve list: drop rows with no target or two targets,
 * default the method, coerce the qty, and uppercase the label. Order is kept.
 */
export function cleanServes(raw: unknown): ServeInput[] {
  if (!Array.isArray(raw)) return []
  const out: ServeInput[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as ServeInput
    const recipeId = typeof s.recipeId === 'string' && s.recipeId ? s.recipeId : null
    const inventoryItemId =
      typeof s.inventoryItemId === 'string' && s.inventoryItemId ? s.inventoryItemId : null
    if (recipeId && inventoryItemId) continue
    if (!recipeId && !inventoryItemId) continue
    const qty = Number(s.qty)
    out.push({
      label: typeof s.label === 'string' && s.label.trim() ? s.label.trim().toUpperCase() : null,
      method: isServeMethod(s.method) ? s.method : 'OTHER',
      recipeId,
      inventoryItemId,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      uomId: typeof s.uomId === 'string' && s.uomId ? s.uomId : null,
    })
  }
  return out
}
