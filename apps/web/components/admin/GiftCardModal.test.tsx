import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { GiftCardModal } from '@/components/admin/GiftCardModal'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}))

const cardDetail = {
  card: {
    id: 'card-1',
    number: '0005',
    amount: 50,
    customerName: 'Liam Heaven',
    customerEmail: 'buyer@example.com',
    message: 'Enjoy!',
    status: 'ISSUED',
    isInternal: false,
    wooOrderId: 'woo-1',
    issuedAt: '2026-09-08T00:00:00.000Z',
    sentAt: null,
    pdfPath: '/uploads/gift-cards/Gift Card - 0005.pdf',
    notes: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    history: [{ at: '2026-09-08T00:00:00.000Z', type: 'ISSUED', note: 'PDF GENERATED' }],
  },
  order: {
    id: 'woo-1',
    wooOrderId: '35',
    orderNumber: '35',
    source: 'WOO',
    status: 'completed',
    opStatus: 'FINALISED',
    paymentStatus: 'PAID',
    paymentMethod: 'cod',
    paidAt: null,
    customerName: 'Liam Heaven',
    customerEmail: 'buyer@example.com',
    customerPhone: null,
    partySize: null,
    serviceDate: null,
    serviceTime: null,
    totalAmount: 50,
    notes: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    syncedAt: null,
    items: [],
  },
  logs: [],
}

const routeMap: Record<string, unknown> = {
  '/api/admin/gift-cards/card-1/detail': cardDetail,
}

// The replace popup overlays the card detail form — its inputs duplicate the
// detail form's placeholders, so scope queries to the popup's field box (the
// one holding the unique REASON input).
function popupFields(): HTMLElement {
  const reason = screen.getByPlaceholderText('WRONG AMOUNT PRINTED / TYPO ON NAME — BE SPECIFIC') as HTMLInputElement
  return reason.closest('div.space-y-2') as HTMLElement
}

describe('GiftCardModal replacement', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockImplementation(() => true)
    vi.spyOn(global, 'fetch').mockImplementation(mocks.fetch)
    mocks.fetch.mockClear()
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST' && url.endsWith('/replace')) {
        return {
          ok: true,
          json: async () => ({ oldCard: { id: 'card-1', number: '0005' }, newCard: { id: 'card-9', number: '0007', amount: 100, status: 'ISSUED' } }),
        } as Response
      }
      const data = routeMap[url]
      return { ok: true, json: async () => data } as Response
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows REPLACE CARD for an ISSUED card and pre-fills the popup from the card', async () => {
    render(<GiftCardModal cardId="card-1" onClose={() => {}} onChanged={() => {}} />)
    const btn = await screen.findByRole('button', { name: 'REPLACE CARD' })
    fireEvent.click(btn)

    expect(screen.getByText('REPLACE GIFT CARD — 0005')).toBeTruthy()
    const fields = popupFields()
    const reason = within(fields).getByPlaceholderText('WRONG AMOUNT PRINTED / TYPO ON NAME — BE SPECIFIC') as HTMLInputElement
    expect(reason).toBeTruthy()
    expect((within(fields).getByPlaceholderText('CUSTOMER NAME') as HTMLInputElement).value).toBe('Liam Heaven')
    expect((within(fields).getByPlaceholderText('email@example.com') as HTMLInputElement).value).toBe('buyer@example.com')
    expect((within(fields).getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('50')
  })

  it('POSTs the corrected details + reason to the replace endpoint and reports the new number', async () => {
    render(<GiftCardModal cardId="card-1" onClose={() => {}} onChanged={() => {}} />)
    const btn = await screen.findByRole('button', { name: 'REPLACE CARD' })
    fireEvent.click(btn)

    const fields = popupFields()
    fireEvent.change(within(fields).getByPlaceholderText('WRONG AMOUNT PRINTED / TYPO ON NAME — BE SPECIFIC'), { target: { value: 'Wrong amount printed' } })
    const amount = within(fields).getByPlaceholderText('0.00') as HTMLInputElement
    fireEvent.change(amount, { target: { value: '100' } })
    fireEvent.change(within(fields).getByPlaceholderText('email@example.com'), { target: { value: 'corrected@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'VOID & ISSUE REPLACEMENT' }))

    await waitFor(() => {
      const call = mocks.fetch.mock.calls.find((c: unknown[]) => String(c[0]).endsWith('/replace'))
      expect(call).toBeTruthy()
      expect(JSON.parse(String((call as unknown[])[1] && ((call as unknown[])[1] as RequestInit).body))).toEqual({
        reason: 'Wrong amount printed',
        customerName: 'Liam Heaven',
        customerEmail: 'corrected@example.com',
        amount: 100,
        message: 'Enjoy!',
      })
    })
    expect(await screen.findByText('REPLACED — NEW CARD #0007')).toBeTruthy()
  })

  it('refuses to replace without a reason', async () => {
    render(<GiftCardModal cardId="card-1" onClose={() => {}} onChanged={() => {}} />)
    const btn = await screen.findByRole('button', { name: 'REPLACE CARD' })
    fireEvent.click(btn)
    fireEvent.click(screen.getByRole('button', { name: 'VOID & ISSUE REPLACEMENT' }))
    expect(await screen.findByText('A REASON IS REQUIRED')).toBeTruthy()
    expect(mocks.fetch.mock.calls.some((c: unknown[]) => String(c[0]).endsWith('/replace'))).toBe(false)
  })

  it('RESET posts to /reset and reports the new DRAFT state', async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST' && url.endsWith('/reset')) {
        return { ok: true, json: async () => ({ ...cardDetail.card, status: 'DRAFT', amount: 0 }) } as Response
      }
      const data = routeMap[url]
      return { ok: true, json: async () => data } as Response
    })
    render(<GiftCardModal cardId="card-1" onClose={() => {}} onChanged={() => {}} />)
    const btn = await screen.findByRole('button', { name: 'RESET' })
    fireEvent.click(btn)
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => {
      expect(mocks.fetch.mock.calls.some((c: unknown[]) => String(c[0]).endsWith('/reset'))).toBe(true)
    })
    expect(await screen.findByText('RESET TO DRAFT — SAME NUMBER, HISTORY KEPT')).toBeTruthy()
  })

  it('DELETE only appears for VOIDED cards and issues a DELETE request', async () => {
    const voided = { ...cardDetail, card: { ...cardDetail.card, status: 'VOIDED' } }
    const del = vi.fn()
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'DELETE') {
        del(init)
        return { ok: true, json: async () => ({ success: true }) } as Response
      }
      if (url.endsWith('/detail')) return { ok: true, json: async () => voided } as Response
      return { ok: true, json: async () => ({}) } as Response
    })
    const { unmount } = render(<GiftCardModal cardId="card-1" onClose={() => {}} onChanged={() => {}} />)
    const delBtn = await screen.findByRole('button', { name: 'DELETE' })
    expect(delBtn).toBeTruthy()
    fireEvent.click(delBtn)
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1))

    // An ISSUED card must not offer DELETE (void first).
    unmount()
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/detail')) return { ok: true, json: async () => cardDetail } as Response
      return { ok: true, json: async () => ({}) } as Response
    })
    render(<GiftCardModal cardId="card-1" onClose={() => {}} onChanged={() => {}} />)
    await screen.findByRole('button', { name: 'REPLACE CARD' })
    expect(screen.queryByRole('button', { name: 'DELETE' })).toBeNull()
  })

  it('renders ORDER · APP history rows from the order history feed', async () => {
    const withOrderHistory = {
      ...cardDetail,
      order: {
        ...cardDetail.order!,
        history: [
          { at: '2026-09-10T00:00:00.000Z', type: 'PAYMENT_CONFIRMED', note: 'PAYMENT CONFIRMED IN THE APP — GIFT CARD #20260004 ISSUED' },
          { at: '2026-09-09T23:00:00.000Z', type: 'CARD_ISSUED', note: 'GIFT CARD #20260004 ISSUED' },
        ],
      },
    }
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/detail')) return { ok: true, json: async () => withOrderHistory } as Response
      return { ok: true, json: async () => ({}) } as Response
    })
    render(<GiftCardModal cardId="card-1" onClose={() => {}} onChanged={() => {}} />)
    const chips = await screen.findAllByText('ORDER · APP')
    expect(chips.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('PAYMENT CONFIRMED IN THE APP — GIFT CARD #20260004 ISSUED')).toBeTruthy()
    expect(screen.getByText('PAYMENT CONFIRMED')).toBeTruthy()
  })
})
