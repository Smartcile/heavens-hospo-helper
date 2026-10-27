// SwiftPOS product catalogue via SwiftDOSnet `GET /api/products` — the menu-item
// mapping view. Pure (no DB, no network) so parsing, grouping and duplicate
// detection can be unit-tested; lib/swiftpos.server.ts does the fetch.
//
// A product row is one POS stock item (`Inventory_Code`). HOSPO OPS maps it to a
// local product via `MenuItem.swiftPosId`. See MENUS.md §8.

export interface SwiftPosProduct {
  /** SwiftPOS `Inventory_Code`. */
  inventoryCode: string
  description: string
  category: string
  printGroupName: string
  masterGroupName: string
  active: boolean
  discontinued: boolean
  price: number
}

export interface ProductPage {
  rows: SwiftPosProduct[]
  hasMore: boolean
  total: number
}

export interface MenuItemRef {
  id: string
  name: string
  swiftPosId: string | null
}

export interface LinkedMenuItem {
  id: string
  name: string
}

export interface ProductLinkRow extends SwiftPosProduct {
  linked: LinkedMenuItem[]
}

export interface CodeGroup {
  code: string
  items: LinkedMenuItem[]
}

export interface ProductLinkReport {
  rows: ProductLinkRow[]
  /** Local codes with no product in the SwiftPOS master (renamed/deleted). */
  orphans: CodeGroup[]
  /**
   * True when the product list was truncated, so orphans could not be proven —
   * an orphan may simply be on a page that was never fetched.
   */
  orphansSuppressed: boolean
  /** Codes claimed by more than one local product — a sale matches only one. */
  duplicates: CodeGroup[]
  linkedCount: number
  unlinkedCount: number
}

export const UNCATEGORISED = 'UNCATEGORISED'

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v).trim() : ''
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'true' || s === '1'
}

function codeKey(code: string): string {
  return code.trim().toUpperCase()
}

function one(raw: unknown): SwiftPosProduct | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const inventoryCode = str(pick(r, 'inventoryCode', 'InventoryCode', 'key', 'Key'))
  if (!inventoryCode) return null
  return {
    inventoryCode,
    description: str(pick(r, 'description', 'Description', 'label', 'Label')),
    category: str(pick(r, 'category', 'Category')),
    printGroupName: str(pick(r, 'printGroupName', 'PrintGroupName')),
    masterGroupName: str(pick(r, 'masterGroupName', 'MasterGroupName')),
    active: bool(pick(r, 'active', 'Active')),
    discontinued: bool(pick(r, 'discontinued', 'Discontinued')),
    price: num(pick(r, 'price', 'Price')),
  }
}

/** Parse `GET /api/products`: `{ rows, hasMore, total }`, a bare array, camel/Pascal. */
export function parseProducts(raw: unknown): ProductPage {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rowsRaw = pick(source, 'rows', 'Rows')
  const input = Array.isArray(raw) ? raw : Array.isArray(rowsRaw) ? (rowsRaw as unknown[]) : []

  const seen = new Set<string>()
  const rows: SwiftPosProduct[] = []
  for (const entry of input) {
    const product = one(entry)
    if (!product) continue
    const key = codeKey(product.inventoryCode)
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(product)
  }

  const hasMore = bool(pick(source, 'hasMore', 'HasMore'))
  const total = num(pick(source, 'total', 'Total')) || rows.length
  return { rows, hasMore, total }
}

/**
 * Classify each SwiftPOS product against the local products that carry a
 * `swiftPosId`. Codes are matched case-insensitively (the same rule as
 * `matchSalesToItems`). Duplicates are surfaced, never resolved: a sale would
 * silently pick one of them.
 */
export function buildProductLinks(
  products: SwiftPosProduct[],
  menuItems: MenuItemRef[],
  options?: { truncated?: boolean },
): ProductLinkReport {
  const truncated = options?.truncated === true
  const productCodes = new Set(products.map((p) => codeKey(p.inventoryCode)))

  const byCode = new Map<string, LinkedMenuItem[]>()
  for (const item of menuItems) {
    const key = item.swiftPosId ? codeKey(item.swiftPosId) : ''
    if (!key) continue
    const list = byCode.get(key) ?? []
    list.push({ id: item.id, name: item.name })
    byCode.set(key, list)
  }

  const rows: ProductLinkRow[] = products.map((product) => ({
    ...product,
    linked: byCode.get(codeKey(product.inventoryCode)) ?? [],
  }))

  const duplicates: CodeGroup[] = []
  const orphans: CodeGroup[] = []
  for (const [code, items] of byCode) {
    if (items.length > 1) duplicates.push({ code, items })
    if (!truncated && !productCodes.has(code)) orphans.push({ code, items })
  }
  duplicates.sort((a, b) => a.code.localeCompare(b.code))
  orphans.sort((a, b) => a.code.localeCompare(b.code))

  return {
    rows,
    orphans,
    orphansSuppressed: truncated,
    duplicates,
    linkedCount: rows.filter((r) => r.linked.length > 0).length,
    unlinkedCount: rows.filter((r) => r.linked.length === 0).length,
  }
}

export interface ProductCategoryGroup {
  category: string
  rows: ProductLinkRow[]
}

/** Group rows by SwiftPOS category, alphabetically with UNCATEGORISED last. */
export function groupProductsByCategory(rows: ProductLinkRow[]): ProductCategoryGroup[] {
  const groups = new Map<string, ProductLinkRow[]>()
  for (const row of rows) {
    const category = row.category.trim() || UNCATEGORISED
    const list = groups.get(category) ?? []
    list.push(row)
    groups.set(category, list)
  }

  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      rows: [...list].sort(
        (a, b) => a.description.localeCompare(b.description) || a.inventoryCode.localeCompare(b.inventoryCode),
      ),
    }))
    .sort((a, b) => {
      if (a.category === UNCATEGORISED) return 1
      if (b.category === UNCATEGORISED) return -1
      return a.category.localeCompare(b.category)
    })
}
