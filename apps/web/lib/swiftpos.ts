// SwiftPOS sales via SwiftDOSnet — the POS feed that drives stock consumption.
//
// SwiftDOSnet mirrors SwiftPOS into Postgres and exposes it at
// GET {base}/api/analytics/sales?groupBy=product&from=&to=. Each row is one
// product: `Key` = the POS `Inventory_Code` (EJItemsTable.InventoryCode), plus
// qty / gross / net. HOSPO OPS maps that code to a MenuItem (MenuItem.swiftPosId)
// and expands the product's serves into stock. See MENUS.md §8.
//
// This file is pure (no DB, no network) so parsing + matching can be unit-tested;
// lib/swiftpos.server.ts does the actual fetch.

export interface SwiftPosSale {
  /** SwiftPOS `Inventory_Code` — the POS product identifier. */
  inventoryCode: string
  /** Product description (ProductTable.Description). */
  label: string
  qty: number
  gross: number
  net: number
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

/** Read a field that may arrive camelCase or PascalCase (ASP.NET JSON). */
function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]
  return undefined
}

/**
 * Parse the body of GET /api/analytics/sales (a `SalesReport`). Tolerant of
 * case, of the `{ rows, totals }` shape, and of a bare rows array. Rows with no
 * product code are dropped.
 */
export function parseSalesReport(raw: unknown): SwiftPosSale[] {
  if (Array.isArray(raw)) return raw.flatMap((r) => one(r))
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rows = pick(o, 'rows', 'Rows')
  return Array.isArray(rows) ? rows.flatMap((r) => one(r)) : []
}

function one(raw: unknown): SwiftPosSale[] {
  if (!raw || typeof raw !== 'object') return []
  const r = raw as Record<string, unknown>
  const inventoryCode = String(pick(r, 'key', 'Key') ?? '').trim()
  if (!inventoryCode) return []
  return [
    {
      inventoryCode,
      label: String(pick(r, 'label', 'Label') ?? '').trim(),
      qty: num(pick(r, 'qty', 'Qty')),
      gross: num(pick(r, 'gross', 'Gross')),
      net: num(pick(r, 'net', 'Net')),
    },
  ]
}

export interface MatchableItem {
  id: string
  name: string
  swiftPosId: string | null
}

export interface MatchedSale extends SwiftPosSale {
  itemId: string | null
  itemName: string | null
}

export interface SalesMatch {
  sales: SwiftPosSale[]
  /** Sales whose code matched a product, in POS order. */
  matched: MatchedSale[]
  /** Sales with no matching product — the mapping gap to fix. */
  unmatched: SwiftPosSale[]
  totalQty: number
  matchedQty: number
}

/**
 * Match POS sales to products by `swiftPosId`. Exact, case-insensitive code
 * match; a product with no code maps only itself until one is set.
 */
export function matchSalesToItems(sales: SwiftPosSale[], items: MatchableItem[]): SalesMatch {
  const byCode = new Map<string, MatchableItem>()
  for (const it of items) {
    if (it.swiftPosId) byCode.set(it.swiftPosId.trim().toUpperCase(), it)
  }

  const matched: MatchedSale[] = []
  const unmatched: SwiftPosSale[] = []
  let matchedQty = 0

  for (const s of sales) {
    const item = byCode.get(s.inventoryCode.trim().toUpperCase())
    if (item) {
      matched.push({ ...s, itemId: item.id, itemName: item.name })
      matchedQty += s.qty
    } else {
      unmatched.push(s)
    }
  }

  return {
    sales,
    matched,
    unmatched,
    totalQty: sales.reduce((sum, s) => sum + s.qty, 0),
    matchedQty,
  }
}
