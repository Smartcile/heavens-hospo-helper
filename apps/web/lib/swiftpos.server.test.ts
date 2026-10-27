import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  PRODUCT_MAX_PAGES,
  fetchKitchenDockets,
  fetchProducts,
} from '@/lib/swiftpos.server'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status < 400,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

afterEach(() => { vi.restoreAllMocks() })

describe('fetchProducts', () => {
  it('pages while hasMore is true (page size capped at 100)', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn((url: string) => {
      const u = String(url)
      calls.push(u)
      if (u.includes('page=1')) {
        return Promise.resolve(jsonResponse({ rows: [{ InventoryCode: 'A' }], hasMore: true, total: 2 }))
      }
      return Promise.resolve(jsonResponse({ rows: [{ InventoryCode: 'B' }], hasMore: false, total: 2 }))
    }) as unknown as typeof fetch

    const result = await fetchProducts('http://swift:5080/')
    expect(result.rows.map((r) => r.inventoryCode)).toEqual(['A', 'B'])
    expect(result.total).toBe(2)
    expect(result.truncated).toBe(false)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toBe('http://swift:5080/api/products?page=1&top=100')
  })

  it('stops at the hard page cap and reports truncation', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(() => {
      calls++
      return Promise.resolve(jsonResponse({ rows: [{ InventoryCode: `P${calls}` }], hasMore: true, total: 99999 }))
    }) as unknown as typeof fetch

    const result = await fetchProducts('http://swift:5080')
    expect(calls).toBe(PRODUCT_MAX_PAGES)
    expect(result.truncated).toBe(true)
    expect(result.rows).toHaveLength(PRODUCT_MAX_PAGES)
  })

  it('surfaces the SwiftDOSnet error text', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ title: 'Catalog unavailable', detail: 'SQL is down' }, 503))) as unknown as typeof fetch
    await expect(fetchProducts('http://swift:5080')).rejects.toThrow(/503.*SQL is down/)
  })
})

describe('fetchKitchenDockets', () => {
  it('sends the wall-clock window and parses the bare array', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn((url: string) => {
      calls.push(String(url))
      return Promise.resolve(jsonResponse([{ TransactionId: 1, TableNumber: 2, Opened: '2026-10-27 18:00:00', Lines: [] }]))
    }) as unknown as typeof fetch

    const dockets = await fetchKitchenDockets('http://swift:5080', '2026-10-27 17:00', '2026-10-27 18:00')
    expect(dockets[0]).toMatchObject({ transactionId: 1, tableNumber: 2 })
    expect(calls[0]).toContain('/api/table-tracking/kitchen-dockets?')
    const params = new URL(calls[0]).searchParams
    expect(params.get('from')).toBe('2026-10-27 17:00')
    expect(params.get('to')).toBe('2026-10-27 18:00')
  })

  it('omits from when every open line is requested', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn((url: string) => {
      calls.push(String(url))
      return Promise.resolve(jsonResponse([]))
    }) as unknown as typeof fetch

    await fetchKitchenDockets('http://swift:5080', null, '2026-10-27 18:00')
    expect(calls[0]).not.toContain('from=')
  })

  it('surfaces the problem detail from SwiftDOSnet', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonResponse({ title: 'Kitchen dockets are unavailable', detail: 'LIVE SQL OFFLINE' }, 500))) as unknown as typeof fetch
    await expect(fetchKitchenDockets('http://swift:5080', null, '2026-10-27 18:00')).rejects.toThrow(/LIVE SQL OFFLINE/)
  })
})
