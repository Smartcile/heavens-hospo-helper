import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PurchaseOrdersClient } from './PurchaseOrdersClient'

const SUPPLIERS = [{ id: 's1', name: 'ACME FOODS' }]
const ITEMS = [{ id: 'i1', name: 'FLOUR', unit: 'KG', costPrice: 5 }]

const ORDER = {
  id: 'po1',
  number: 'PO-1',
  status: 'SENT',
  expectedAt: null,
  total: 10,
  supplier: { id: 's1', name: 'ACME FOODS' },
  lineCount: 1,
}

const DETAIL = {
  ...ORDER,
  subtotal: 10,
  gst: 1.5,
  notes: null,
  orderedAt: null,
  lines: [
    {
      id: 'l1',
      description: 'FLOUR',
      qty: 5,
      unitPrice: 2,
      lineTotal: 10,
      receivedQty: 0,
      inventoryItemId: 'i1',
    },
  ],
  deliveries: [],
  invoices: [],
}

function json(data: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) })
}

let orders: unknown[] = []
let saves: Record<string, unknown>[] = []
let receipts: Record<string, unknown>[] = []

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    const href = String(url)
    if (href.startsWith('/api/admin/purchase-orders/po1/receive')) {
      receipts.push(JSON.parse(String(init?.body)))
      return json({ purchaseOrder: { ...DETAIL, status: 'PARTIALLY_RECEIVED' }, delivery: { id: 'd1' }, priceMovements: [] })
    }
    if (href.startsWith('/api/admin/purchase-orders/po1')) {
      return json(DETAIL)
    }
    if (href.startsWith('/api/admin/purchase-orders')) {
      if (init?.method === 'POST') {
        saves.push(JSON.parse(String(init.body)))
        return json(ORDER, 201)
      }
      return json(orders)
    }
    if (href.startsWith('/api/admin/suppliers')) return json(SUPPLIERS)
    if (href.startsWith('/api/admin/inventory')) return json(ITEMS)
    if (href.startsWith('/api/admin/price-movements')) return json({ movements: [], count: 0 })
    return json(null)
  }) as unknown as typeof fetch
}

async function waitForOptions(label: string) {
  await waitFor(() => {
    const select = screen.getByLabelText(label) as HTMLSelectElement
    expect(select.querySelectorAll('option').length).toBeGreaterThan(1)
  })
}

describe('PurchaseOrdersClient', () => {
  beforeEach(() => {
    orders = []
    saves = []
    receipts = []
    globalThis.fetch = mockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts the supplier, number and lines when a new PO is saved', async () => {
    render(<PurchaseOrdersClient role="MANAGER" sessionVenueId="v1" />)

    fireEvent.click(screen.getByText('+ NEW PO'))
    await waitForOptions('PO SUPPLIER')
    await waitForOptions('PO ITEM 1')

    fireEvent.change(screen.getByLabelText('PO SUPPLIER'), { target: { value: 's1' } })
    fireEvent.change(screen.getByLabelText('PO NUMBER'), { target: { value: 'PO-9' } })
    fireEvent.change(screen.getByLabelText('PO ITEM 1'), { target: { value: 'i1' } })
    fireEvent.change(screen.getByLabelText('PO QTY 1'), { target: { value: '2' } })

    fireEvent.click(screen.getByText('SAVE PO'))

    await waitFor(() => expect(saves).toHaveLength(1))
    expect(saves[0]).toMatchObject({
      venueId: 'v1',
      supplierId: 's1',
      number: 'PO-9',
    })
    const lines = saves[0].lines as Record<string, unknown>[]
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      inventoryItemId: 'i1',
      description: 'FLOUR',
      qty: 2,
      unitPrice: 5,
    })
  })

  it('posts the received quantity and price for a line', async () => {
    orders = [ORDER]
    render(<PurchaseOrdersClient role="MANAGER" sessionVenueId="v1" />)

    fireEvent.click(await screen.findByText('PO-1'))
    fireEvent.click(await screen.findByText('RECEIVE'))

    const qty = await screen.findByLabelText('RECEIVE QTY 1')
    fireEvent.change(qty, { target: { value: '3' } })
    fireEvent.click(screen.getByText('POST RECEIPT'))

    await waitFor(() => expect(receipts).toHaveLength(1))
    const lines = receipts[0].lines as Record<string, unknown>[]
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ lineId: 'l1', qty: 3, unitPrice: 2 })
  })
})
