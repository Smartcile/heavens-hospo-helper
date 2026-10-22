// Server half of the SwiftPOS feed: the HTTP call to SwiftDOSnet. The parsing +
// matching is pure (lib/swiftpos.ts) so it unit-tests without a network.
// Prisma/network — never import from a client component.

import { parseSalesReport, type SwiftPosSale } from '@/lib/swiftpos'

const TIMEOUT_MS = 15000

async function getJson(baseUrl: string, path: string): Promise<unknown> {
  const base = baseUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`SwiftDOSnet returned ${res.status} ${res.statusText}`)
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
    throw new Error(`SwiftDOSnet returned ${res.status} ${res.statusText}`)
  }
  return parseSalesReport(await res.json())
}
