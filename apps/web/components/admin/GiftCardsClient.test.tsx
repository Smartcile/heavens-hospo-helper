import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}))

import { GiftCardsClient } from '@/components/admin/GiftCardsClient'

const card = {
  id: 'gc1',
  number: '20260001',
  amount: 50,
  customerName: null,
  customerEmail: null,
  message: null,
  status: 'DRAFT',
  isInternal: false,
  wooOrderId: null,
  wooOrderNumber: null,
  issuedAt: null,
  sentAt: null,
  expiresAt: null,
  pdfPath: null,
  notes: null,
  createdAt: '2026-08-20T00:00:00Z',
}

const template = {
  id: 'tpl1',
  name: 'AKARANA CARD',
  filePath: '/uploads/gift-cards/templates/x.pdf',
  fieldMapping: [
    { pdfField: 'Value', dataKey: 'amount', format: '2dp' },
    { pdfField: 'Voucher Number', dataKey: 'number' },
    { pdfField: 'Date of Issue', dataKey: 'issueDate' },
  ],
  isActive: true,
  fields: [
    { name: 'Value', type: 'text' },
    { name: 'Voucher Number', type: 'text' },
    { name: 'Date of Issue', type: 'text' },
  ],
}

const mockResponse = (data: unknown, ok = true) => ({ ok, json: async () => data } as Response)

function mockFetch(handlers: Record<string, unknown>) {
  return vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const key = Object.keys(handlers).find((k) => url.includes(k))
    return mockResponse(handlers[key ?? ''] ?? {})
  })
}

describe('GiftCardsClient', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the cards list and issue box', async () => {
    mockFetch({ '/api/admin/gift-cards?': [card], '/api/admin/gift-card-templates': [] })

    render(<GiftCardsClient />)

    expect(await screen.findByText('GIFT CARDS')).toBeDefined()
    expect(screen.getAllByText(/20260001/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('ISSUE GIFT CARD').length).toBeGreaterThan(0)
  })

  it('shows the active template badge on the issue box', async () => {
    mockFetch({ '/api/admin/gift-cards?': [card], '/api/admin/gift-card-templates': [template] })

    render(<GiftCardsClient />)

    await waitFor(() => {
      expect(screen.getByText(/TEMPLATE: AKARANA CARD/)).toBeDefined()
    })
  })

  it('uploads a template PDF and opens the mapping modal', async () => {
    const post = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-card-templates') && (init?.method ?? 'GET') === 'POST') {
        post(init)
        return mockResponse(template, true)
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    const file = new File(['%PDF-1.4 test'], 'card.pdf', { type: 'application/pdf' })
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [file] } })
    fireEvent.click(screen.getByText('UPLOAD TEMPLATE'))

    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
      expect(post.mock.calls[0][0].method).toBe('POST')
      const body = post.mock.calls[0][0].body as FormData
      expect(body.get('file')).toBe(file)
      expect(body.get('name')).toBe('')
    })
    expect(await screen.findByText('FIELD MAPPING')).toBeDefined()
  })

  it('saves the mapping via PUT', async () => {
    const put = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-card-templates') && (init?.method ?? 'GET') === 'PUT') {
        put(init)
        return mockResponse(template, true)
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      return mockResponse([template])
    })

    render(<GiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    fireEvent.click(screen.getByText('MAPPING'))
    await screen.findByText('FIELD MAPPING')
    expect(screen.getByText('LIVE PREVIEW')).toBeTruthy() // right-hand preview panel
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('SAVE MAPPING'))

    await waitFor(() => {
      expect(put).toHaveBeenCalledTimes(1)
      const body = JSON.parse((put.mock.calls[0][0].body as string) ?? '{}')
      expect(body.fieldMapping).toEqual(template.fieldMapping)
    })
  })

  it('replaces the PDF file on a template via PUT and reopens the mapping editor', async () => {
    const put = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/file') && (init?.method ?? 'GET') === 'PUT') {
        put(init)
        return mockResponse(template, true)
      }
      if (url.includes('/api/admin/gift-card-templates') && (init?.method ?? 'GET') === 'GET') {
        return mockResponse([template])
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    const label = screen.getByText('REPLACE FILE') as HTMLLabelElement
    const fileInput = label.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF-1.4 replacement'], 'card-v2.pdf', { type: 'application/pdf' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(put).toHaveBeenCalledTimes(1)
      expect(put.mock.calls[0][0].method).toBe('PUT')
      const body = put.mock.calls[0][0].body as FormData
      expect(body.get('file')).toBe(file)
    })
    // The mapping editor opens automatically so the new file's fields can be checked.
    expect(await screen.findByText('FIELD MAPPING')).toBeDefined()
  })

  it('removes the PDF file from a template via DELETE', async () => {
    const del = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/file') && (init?.method ?? 'GET') === 'DELETE') {
        del(init)
        return mockResponse({ ...template, filePath: null }, true)
      }
      if (url.includes('/api/admin/gift-card-templates') && (init?.method ?? 'GET') === 'GET') {
        return mockResponse([template])
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    fireEvent.click(screen.getByText('REMOVE FILE'))

    await waitFor(() => {
      expect(del).toHaveBeenCalledTimes(1)
      expect(del.mock.calls[0][0].method).toBe('DELETE')
    })
    // The row now shows the NO FILE badge and MAPPING/PREVIEW become unavailable.
    expect(await screen.findByText('NO FILE')).toBeTruthy()
  })

  it('shows the linked WooCommerce category on the sync box', async () => {
    mockFetch({
      '/api/admin/gift-cards?': [card],
      '/api/admin/gift-card-templates': [],
      '/api/admin/gift-cards/settings': {
        giftCardCategoryId: '42',
        giftCardCategoryName: 'GIFT CARDS',
        hasIntegration: true,
      },
      '/api/admin/woocommerce/categories': { categories: [{ id: 42, name: 'GIFT CARDS' }] },
    })

    render(<GiftCardsClient />)

    await waitFor(() => {
      expect(screen.getByText('WOOCOMMERCE SYNC')).toBeDefined()
      expect(screen.getByText('CAT: GIFT CARDS')).toBeDefined()
    })
  })

  it('shows UNLINKED + the no-integration warning when nothing is linked', async () => {
    mockFetch({
      '/api/admin/gift-cards?': [card],
      '/api/admin/gift-card-templates': [],
      '/api/admin/gift-cards/settings': {
        giftCardCategoryId: null,
        giftCardCategoryName: null,
        hasIntegration: false,
      },
      '/api/admin/woocommerce/categories': { categories: [] },
    })

    render(<GiftCardsClient />)

    await waitFor(() => {
      expect(screen.getByText('UNLINKED')).toBeDefined()
      expect(screen.getByText(/NO ACTIVE WOOCOMMERCE INTEGRATION/)).toBeDefined()
    })
  })

  it('saves the WooCommerce category link via PUT', async () => {
    const put = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-cards/settings') && (init?.method ?? 'GET') === 'PUT') {
        put(init)
        return mockResponse({ giftCardCategoryId: '42', giftCardCategoryName: 'GIFT CARDS' })
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      if (url.includes('/api/admin/gift-cards/settings')) {
        return mockResponse({ giftCardCategoryId: null, giftCardCategoryName: null, hasIntegration: true })
      }
      if (url.includes('/api/admin/woocommerce/categories')) {
        return mockResponse({ categories: [{ id: 42, name: 'GIFT CARDS' }] })
      }
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByRole('heading', { name: 'GIFT CARDS' })

    const select = screen.getByLabelText('GIFT CARD CATEGORY') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '42' } })
    fireEvent.click(screen.getByText('SAVE LINK'))

    await waitFor(() => {
      expect(put).toHaveBeenCalledTimes(1)
      const body = JSON.parse((put.mock.calls[0][0].body as string) ?? '{}')
      expect(body.categoryId).toBe('42')
    })
  })

  it('creates ONE variable gift card product via POST (default denominations)', async () => {
    const post = vi.fn()
    let createdProduct = false
    const created = {
      id: 'gc-prod-1', name: 'GIFT CARD', price: 0, wooProductId: '31', wooCategoryId: '42',
      imageUrl: null, isVariable: true,
      variations: [
        { name: '$50', price: 50 },
        { name: '$100', price: 100 },
        { name: '$150', price: 150 },
      ],
      createdAt: '2026-09-08T00:00:00Z',
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-cards/products') && (init?.method ?? 'GET') === 'POST') {
        post(init)
        createdProduct = true
        return mockResponse({ product: created, category: { id: '42', name: 'GIFT CARDS' }, synced: true })
      }
      if (url.includes('/api/admin/gift-cards/products')) return mockResponse(createdProduct ? [created] : [])
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      if (url.includes('/api/admin/gift-cards/settings')) {
        return mockResponse({ giftCardCategoryId: '42', giftCardCategoryName: 'GIFT CARDS', hasIntegration: true })
      }
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByRole('heading', { name: 'GIFT CARDS' })

    // The product section only appears once a category is linked.
    expect(await screen.findByText('GIFT CARD PRODUCT')).toBeTruthy()
    expect(screen.getByText(/HIDDEN FROM RECIPES/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '+ CREATE GIFT CARD PRODUCT' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
      const body = JSON.parse((post.mock.calls[0][0].body as string) ?? '{}')
      expect(body).toEqual({ name: null })
    })
    // One variable product with denomination chips, plus the editor rows.
    expect(await screen.findByText('VARIABLE · 3 DENOMINATIONS')).toBeTruthy()
    expect(screen.getByText('$50 / $100 / $150')).toBeTruthy()
    expect(screen.getByText('WOO #31')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'SAVE PRODUCT CHANGES' })).toBeTruthy()
  })

  it('edits product name, short description and denominations via PUT', async () => {
    const put = vi.fn()
    const product = {
      id: 'gc-prod-1', name: 'GIFT CARD', price: 0, wooProductId: '31', wooCategoryId: '42',
      imageUrl: null, shortDescription: null, isVariable: true,
      variations: [{ name: '$50', price: 50, wooVariationId: '901' }],
      createdAt: '2026-09-08T00:00:00Z',
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-cards/products/gc-prod-1') && (init?.method ?? 'GET') === 'PUT') {
        put(init)
        return mockResponse({
          product: {
            ...product, name: 'GIFT VOUCHER', shortDescription: 'REDEEMABLE AT THE BAR',
            variations: [{ name: '$100', price: 100, wooVariationId: '901' }],
          },
          synced: true,
        })
      }
      if (url.includes('/api/admin/gift-cards/products')) return mockResponse([product])
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      if (url.includes('/api/admin/gift-cards/settings')) {
        return mockResponse({ giftCardCategoryId: '42', giftCardCategoryName: 'GIFT CARDS', hasIntegration: true })
      }
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByText('VARIABLE · 1 DENOMINATION')

    // Edit the product fields and the denomination amount, then save.
    const nameInput = screen.getByDisplayValue('GIFT CARD') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'GIFT VOUCHER' } })
    const spinbuttons = screen.getAllByRole('spinbutton')
    const amountInput = spinbuttons[spinbuttons.length - 1] as HTMLInputElement
    fireEvent.change(amountInput, { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE PRODUCT CHANGES' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledTimes(1)
      const body = JSON.parse((put.mock.calls[0][0].body as string) ?? '{}')
      expect(body.name).toBe('GIFT VOUCHER')
      expect(body.denominations).toEqual([100])
    })
    // Updated name and denom chip reflect the server response.
    expect(await screen.findByText('GIFT VOUCHER')).toBeTruthy()
    expect(screen.getByText('$100')).toBeTruthy()
    expect(screen.getByText('SYNCED')).toBeTruthy()
  })

  it('deletes a gift card product via DELETE', async () => {
    const del = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const product = {
      id: 'gc-prod-1', name: 'GIFT CARD', price: 0, wooProductId: '32', wooCategoryId: '42',
      imageUrl: null, isVariable: true,
      variations: [{ name: '$50', price: 50 }],
      createdAt: '2026-09-08T00:00:00Z',
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-cards/products/') && (init?.method ?? 'GET') === 'DELETE') {
        del(url)
        return mockResponse({ ok: true })
      }
      if (url.includes('/api/admin/gift-cards/products')) return mockResponse([product])
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      if (url.includes('/api/admin/gift-cards/settings')) {
        return mockResponse({ giftCardCategoryId: '42', giftCardCategoryName: 'GIFT CARDS', hasIntegration: true })
      }
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    expect(await screen.findByText('GIFT CARD')).toBeTruthy()

    fireEvent.click(screen.getByTitle('DELETE GIFT CARD'))

    await waitFor(() => {
      expect(del).toHaveBeenCalledTimes(1)
      expect(String(del.mock.calls[0][0])).toContain('/api/admin/gift-cards/products/gc-prod-1')
    })
  })

  it('opens the card popup with order + history and saves edited details', async () => {
    const put = vi.fn()
    const detail = {
      card: {
        id: 'gc1', number: '20260001', amount: 50, customerName: null, customerEmail: null,
        message: null, status: 'ISSUED', isInternal: false, wooOrderId: 'woo-9', issuedAt: '2026-09-01T00:00:00Z',
        sentAt: null, pdfPath: '/app/uploads/gift-cards/Gift Card - 20260001.pdf', notes: null,
        createdAt: '2026-08-20T00:00:00Z',
        history: [{ at: '2026-08-20T00:00:00Z', type: 'CREATED', note: 'AUTO-CREATED FROM WOOCOMMERCE ORDER #987' }],
      },
      order: {
        id: 'woo-9', wooOrderId: '987', orderNumber: '1234', source: 'WOOCOMMERCE', status: 'completed',
        opStatus: 'FINALISED', paymentStatus: 'PAID', paymentMethod: 'card', paidAt: '2026-08-20T01:00:00Z',
        customerName: 'SUE LANE', customerEmail: 'sue@example.com', customerPhone: null, partySize: 2,
        serviceDate: '2026-08-21', serviceTime: '18:00', totalAmount: 150, notes: null,
        createdAt: '2026-08-20T00:00:00Z', syncedAt: '2026-08-20T00:00:01Z',
        items: [
          { id: 'li1', productName: 'GIFT CARD', qty: 2, unitPrice: 50, notes: null, customerNote: null, allergenNote: null },
          { id: 'li2', productName: 'GIFT CARD', qty: 1, unitPrice: 50, notes: null, customerNote: null, allergenNote: null },
        ],
      },
      logs: [
        { id: 'log1', direction: 'WEBHOOK', status: 'SUCCESS', message: 'ORDER 987 UPSERTED FROM WEBHOOK', createdAt: '2026-08-20T00:00:01Z' },
      ],
    }
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/detail')) return mockResponse(detail)
      if (url.includes('/api/admin/gift-cards/') && (init?.method ?? 'GET') === 'PUT') {
        put(init)
        return mockResponse({ ...detail.card, customerName: 'SUE LANE', amount: 250 })
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      if (url.includes('/api/admin/gift-cards/settings')) {
        return mockResponse({ giftCardCategoryId: null, giftCardCategoryName: null, hasIntegration: false })
      }
      return mockResponse([])
    })

    render(<GiftCardsClient />)

    // Click the card row once the list has loaded (the ISSUE box shows the
    // same number — pick the element whose ancestor is the row button).
    const numbers = await screen.findAllByText(/20260001/)
    const row = numbers.map((el) => el.closest('button')).find(Boolean) as HTMLElement
    fireEvent.click(row)

    expect(await screen.findByText('WOO ORDER #1234')).toBeTruthy()
    expect(screen.getByText(/HISTORY — EVERYTHING/)).toBeTruthy()
    expect(screen.getByText('AUTO-CREATED FROM WOOCOMMERCE ORDER #987')).toBeTruthy()
    expect(screen.getByText('ORDER 987 UPSERTED FROM WEBHOOK')).toBeTruthy()
    expect(screen.getAllByText(/PAID/).length).toBeGreaterThan(0) // order payment status

    // Edit amount + save details.
    const spinbuttons = screen.getAllByRole('spinbutton')
    const amountInput = spinbuttons[spinbuttons.length - 1] as HTMLInputElement
    fireEvent.change(amountInput, { target: { value: '250' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE DETAILS' }))

    await waitFor(() => {
      expect(put).toHaveBeenCalledTimes(1)
      const body = JSON.parse((put.mock.calls[0][0].body as string) ?? '{}')
      expect(body.amount).toBe(250)
    })
  })

  it('shows the WOO order number badge on synced cards', async () => {
    mockFetch({
      '/api/admin/gift-cards?': [{ ...card, wooOrderId: '987', wooOrderNumber: '1234' }],
      '/api/admin/gift-card-templates': [],
      '/api/admin/gift-cards/settings': { giftCardCategoryId: null, giftCardCategoryName: null, hasIntegration: false },
      '/api/admin/woocommerce/categories': { categories: [] },
    })

    render(<GiftCardsClient />)

    expect(await screen.findByText('WOO #1234')).toBeDefined()
  })

  it('bulk prints the selected cards into one PDF', async () => {
    const post = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:fake')
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/bulk-pdf')) {
        post(init)
        return { ok: true, blob: async () => new Blob(['pdf']) } as Response
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    const row = screen.getAllByText(/20260001/).map((el) => el.closest('button')).find(Boolean) as HTMLElement
    const checkbox = row.querySelector('input[type="checkbox"]') as HTMLInputElement
    fireEvent.click(checkbox)

    fireEvent.click(screen.getByText('BULK PRINT (1)'))

    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
      const body = JSON.parse((post.mock.calls[0][0].body as string) ?? '{}')
      expect(body.cardIds).toEqual(['gc1'])
    })
  })

  it('CREATE GIFT CARDS: the main button makes a single, the ▾ opens SINGLE/BULK', async () => {
    const post = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-cards') && (init?.method ?? 'GET') === 'POST' && !url.includes('/products')) {
        post(init)
        return mockResponse({ id: 'gc-new' })
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    // Main button creates a single blank card.
    fireEvent.click(screen.getByRole('button', { name: 'CREATE GIFT CARDS' }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0][0].method).toBe('POST')

    // ▾ opens the dropdown with SINGLE and BULK; BULK opens the bulk modal.
    fireEvent.click(screen.getByTitle('CREATE SINGLE OR BULK'))
    expect(screen.getByRole('button', { name: '+ SINGLE' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'BULK' }))
    expect(await screen.findByText('BULK CREATE')).toBeTruthy()
  })

  it('ISSUE GIFT CARD opens the issue popup and issues via POST', async () => {
    const issue = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/gift-cards/gc1/issue') && (init?.method ?? 'GET') === 'POST') {
        issue(init)
        return mockResponse({ ...card, status: 'ISSUED' })
      }
      if (url.includes('/api/admin/gift-cards/next-number')) {
        return mockResponse({ draft: { id: 'gc1', number: '20260001' } })
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    const issueButtons = await screen.findAllByRole('button', { name: 'ISSUE GIFT CARD' })
    fireEvent.click(issueButtons[0])

    expect(await screen.findByText('NUMBER 20260001')).toBeTruthy()
    expect(screen.getByText(/SAMPLE — WHAT THE CARD LOOKS LIKE/)).toBeTruthy()

    const amount = screen.getAllByRole('spinbutton')[0] as HTMLInputElement
    fireEvent.change(amount, { target: { value: '75' } })
    const confirm = screen.getAllByRole('button', { name: 'ISSUE GIFT CARD' })
    fireEvent.click(confirm[confirm.length - 1])

    await waitFor(() => {
      expect(issue).toHaveBeenCalledTimes(1)
      const body = JSON.parse((issue.mock.calls[0][0].body as string) ?? '{}')
      expect(body.amount).toBe(75)
      expect(body.isInternal).toBe(false)
    })
  })

  it('SYNC WOOCOMMERCE pulls orders only (gift cards arrive, nothing else touched)', async () => {
    const post = vi.fn()
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/sync/pull-orders') && (init?.method ?? 'GET') === 'POST') {
        post(init)
        return mockResponse({ message: 'Pulled orders: 2 synced.' })
      }
      if (url.includes('/api/admin/gift-cards?')) return mockResponse([card])
      if (url.includes('/api/admin/gift-cards/settings')) {
        return mockResponse({ giftCardCategoryId: null, giftCardCategoryName: null, hasIntegration: true })
      }
      return mockResponse([])
    })

    render(<GiftCardsClient />)
    fireEvent.click(await screen.findByRole('button', { name: 'SYNC WOOCOMMERCE (GIFT CARDS + ORDERS)' }))

    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(1)
      expect(post.mock.calls[0][0].method).toBe('POST')
    })
    expect(await screen.findByText('Pulled orders: 2 synced.')).toBeTruthy()
  })
})
