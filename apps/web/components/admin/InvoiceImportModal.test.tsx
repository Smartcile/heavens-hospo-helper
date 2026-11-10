import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InvoiceImportModal } from './InvoiceImportModal'

const SUPPLIERS = [{ id: 's1', name: 'ACME FOODS' }]
const ITEMS = [
  { id: 'i1', name: 'FLOUR' },
  { id: 'i2', name: 'SUGAR' },
]

const PREVIEW = {
  fileUrl: '/api/upload/invoice.pdf',
  template: { id: 't1', name: 'ACME TEMPLATE', version: 2 },
  header: {
    invoiceNumber: 'INV-1',
    invoiceDate: '2026-11-01',
    dueDate: '2026-11-14',
    subtotal: 30,
    gst: 4.5,
    total: 34.5,
  },
  lines: [
    {
      description: 'FLOUR 25KG',
      supplierSku: 'FLOUR25',
      qty: 2,
      unitPrice: 10,
      lineTotal: 20,
      match: { inventoryItemId: 'i1', status: 'MATCHED', reason: 'SKU' },
      poLine: null,
    },
    {
      description: 'MYSTERY THING',
      supplierSku: null,
      qty: 1,
      unitPrice: 10,
      lineTotal: 10,
      match: { status: 'NEW', reason: 'NONE' },
      poLine: null,
    },
  ],
  issues: [],
  purchaseOrderId: null,
}

function json(data: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) })
}

let imports: Record<string, unknown>[] = []
let commits: Record<string, unknown>[] = []
let duplicate = false

function mockFetch() {
  return vi.fn((url: string, init?: RequestInit) => {
    const href = String(url)
    if (href.startsWith('/api/admin/supplier-templates')) {
      return json([{ id: 't1', name: 'ACME TEMPLATE', version: 2, status: 'ACTIVE' }])
    }
    if (href.startsWith('/api/admin/supplier-invoices/import/commit')) {
      commits.push(JSON.parse(String(init?.body)))
      if (duplicate) return json({ error: 'INVOICE NUMBER ALREADY EXISTS' }, 409)
      return json({ invoice: { id: 'inv1' }, summary: {} }, 201)
    }
    if (href.startsWith('/api/admin/supplier-invoices/import')) {
      imports.push(JSON.parse(String(init?.body)))
      return json(PREVIEW)
    }
    return json(null)
  }) as unknown as typeof fetch
}

async function goToPreview() {
  fireEvent.change(screen.getByLabelText('SUPPLIER'), { target: { value: 's1' } })
  fireEvent.click(screen.getByText('PASTE TEXT'))
  fireEvent.change(screen.getByLabelText('INVOICE TEXT'), {
    target: { value: 'ACME FOODS INVOICE INV-1' },
  })
  fireEvent.click(screen.getByText('EXTRACT & PREVIEW'))
  await screen.findByText('FLOUR 25KG')
}

describe('InvoiceImportModal', () => {
  beforeEach(() => {
    imports = []
    commits = []
    duplicate = false
    globalThis.fetch = mockFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts a preview and commits every line including an unmatched one', async () => {
    const onDone = vi.fn()

    render(
      <InvoiceImportModal
        isOpen
        onClose={() => {}}
        suppliers={SUPPLIERS}
        inventoryItems={ITEMS}
        role="MANAGER"
        venueId="v1"
        onDone={onDone}
      />,
    )

    await goToPreview()

    expect(imports).toHaveLength(1)
    expect(imports[0].supplierId).toBe('s1')
    expect(imports[0].text).toContain('ACME FOODS')

    expect((screen.getByLabelText('ITEM FOR LINE 1') as HTMLSelectElement).value).toBe('i1')
    expect((screen.getByLabelText('ITEM FOR LINE 2') as HTMLSelectElement).value).toBe('')

    fireEvent.click(screen.getByText('COMMIT INVOICE'))

    await waitFor(() => expect(commits).toHaveLength(1))
    const body = commits[0]
    expect(body.supplierId).toBe('s1')
    expect(body.header).toMatchObject({ invoiceNumber: 'INV-1' })
    expect(body.confirmItemCodes).toBe(true)
    expect(body.confirmAliases).toBe(true)

    const lines = body.lines as Record<string, unknown>[]
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ inventoryItemId: 'i1', qty: 2, unitPrice: 10 })
    expect(lines[1]).toMatchObject({ inventoryItemId: null, description: 'MYSTERY THING' })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('shows a duplicate invoice-number error inline on a 409', async () => {
    duplicate = true

    render(
      <InvoiceImportModal
        isOpen
        onClose={() => {}}
        suppliers={SUPPLIERS}
        inventoryItems={ITEMS}
        role="MANAGER"
        venueId="v1"
        onDone={() => {}}
      />,
    )

    await goToPreview()
    fireEvent.click(screen.getByText('COMMIT INVOICE'))

    await screen.findByText('INVOICE NUMBER ALREADY EXISTS')
    expect(commits).toHaveLength(1)
  })
})
