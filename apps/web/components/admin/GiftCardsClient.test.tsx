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
    return mockResponse(handlers[key ?? ''])
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
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('SAVE MAPPING'))

    await waitFor(() => {
      expect(put).toHaveBeenCalledTimes(1)
      const body = JSON.parse((put.mock.calls[0][0].body as string) ?? '{}')
      expect(body.fieldMapping).toEqual(template.fieldMapping)
    })
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
})
