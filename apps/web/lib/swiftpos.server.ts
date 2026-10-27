// Server half of the SwiftPOS feed: the HTTP call to SwiftDOSnet. The parsing +
// matching is pure (lib/swiftpos*.ts) so it unit-tests without a network.
// Prisma/network — never import from a client component.

import { parseSalesReport, type SwiftPosSale } from '@/lib/swiftpos'
import { parseProducts, type SwiftPosProduct } from '@/lib/swiftpos-products'
import { parseKitchenDockets, type KitchenDocket } from '@/lib/swiftpos-dockets'

const TIMEOUT_MS = 15000
export const PRODUCT_PAGE_SIZE = 100
export const PRODUCT_MAX_PAGES = 20

/** SwiftDOSnet problem responses (RFC 7807) carry `title` / `detail`. */
async function problemDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (!text) return ''
  try {
    const body = JSON.parse(text) as Record<string, unknown>
    const detail = typeof body.detail === 'string' ? body.detail : ''
    const title = typeof body.title === 'string' ? body.title : ''
    return detail || title
  } catch {
    return text
  }
}

async function getJson(baseUrl: string, path: string): Promise<unknown> {
  const base = baseUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await problemDetail(res)
    throw new Error(
      `SwiftDOSnet returned ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
    )
  }
  return res.json()
}

/** SwiftDOSnet's lookup lists (locations/terminals/clerks/medias/print groups). */
export async function fetchLookups(baseUrl: string): Promise<unknown> {
  return getJson(baseUrl, '/api/lookups')
}

/**
 * Pull per-product sales for an inclusive date range from SwiftDOSnet:
 * GET {base}/api/analytics/sales?groupBy=product&from=&to=.
 * `from` / `to` are `YYYY-MM-DD` strings (SwiftDOSnet parses them local).
 */
export async function fetchProductSales(
  baseUrl: string,
  from: string,
  to: string,
): Promise<SwiftPosSale[]> {
  const base = baseUrl.replace(/\/+$/, '')
  const url = new URL(`${base}/api/analytics/sales`)
  url.searchParams.set('groupBy', 'product')
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) {
    const detail = await problemDetail(res)
    throw new Error(
      `SwiftDOSnet returned ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`,
    )
  }
  return parseSalesReport(await res.json())
}

export interface ProductFetch {
  rows: SwiftPosProduct[]
  total: number
  /** True when the hard page cap was hit before `hasMore` went false. */
  truncated: boolean
}

/**
 * Pull the SwiftPOS product master. `/api/products` pages 100 at a time, so
 * loop while `hasMore` up to a hard cap (20 pages / 2,000 rows) and report
 * truncation rather than shipping an unbounded payload to the browser.
 */
export async function fetchProducts(baseUrl: string): Promise<ProductFetch> {
  const rows: SwiftPosProduct[] = []
  let total = 0
  let truncated = false

  for (let page = 1; page <= PRODUCT_MAX_PAGES; page++) {
    const parsed = parseProducts(
      await getJson(baseUrl, `/api/products?page=${page}&top=${PRODUCT_PAGE_SIZE}`),
    )
    rows.push(...parsed.rows)
    total = parsed.total || rows.length
    if (!parsed.hasMore) break
    if (parsed.rows.length === 0) break
    if (page === PRODUCT_MAX_PAGES) truncated = true
  }

  return { rows, total, truncated }
}

/**
 * Live kitchen dockets (open sales) from SwiftDOSnet. `from` / `to` are
 * unzoned venue-local `yyyy-MM-dd HH:mm` strings; omit `from` for every line.
 */
export async function fetchKitchenDockets(
  baseUrl: string,
  from: string | null,
  to: string,
): Promise<KitchenDocket[]> {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const query = params.toString()
  const raw = await getJson(
    baseUrl,
    `/api/table-tracking/kitchen-dockets${query ? `?${query}` : ''}`,
  )
  return parseKitchenDockets(raw)
}
