import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.reject(new Error('no pdf')) })),
}))

const mocks = vi.hoisted(() => ({ useWorkerImmersive: vi.fn() }))
vi.mock('@/components/worker/useWorkerImmersive', () => ({
  useWorkerImmersive: mocks.useWorkerImmersive,
}))

import { WorkerGiftCardsClient } from '@/components/worker/WorkerGiftCardsClient'

beforeEach(() => {
  mocks.useWorkerImmersive.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const moduleState = {
  allowed: true,
  canManage: false,
  draft: { id: 'draft-1', number: '20260001' },
  nextNumber: null,
  poolFull: false,
}

const searchCard = {
  id: 'card-3',
  number: '20260003',
  amount: 50,
  redeemedAmount: 0,
  status: 'ISSUED',
  customerName: 'LIAM HEAVEN',
  customerEmail: 'buyer@example.com',
  message: 'Enjoy!',
  issuedAt: '2026-11-01T00:00:00.000Z',
  expiresAt: null,
  redeemedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
}

describe('WorkerGiftCardsClient', () => {
  it('opens the issued card PDF inside the app instead of window.open', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/worker/giftcards') && (init?.method ?? 'GET') === 'POST') {
        return { ok: true, json: async () => ({ cardId: 'card-1', number: '20260001', amount: 50 }) } as Response
      }
      return {
        ok: true,
        json: async () => ({
          allowed: true,
          draft: { id: 'draft-1', number: '20260001' },
          nextNumber: null,
          poolFull: false,
        }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<WorkerGiftCardsClient />)

    await screen.findByText('GIFT CARDS')
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '50' } })
    fireEvent.click(screen.getByText('ISSUE GIFT CARD'))

    await screen.findByText('GIFT CARD ISSUED')
    fireEvent.click(screen.getByText('VIEW / PRINT PDF'))

    expect(await screen.findByTestId('pdf-document-view')).toBeTruthy()
    expect(screen.getByTitle('GIFT CARD 20260001')).toBeTruthy()
    expect(open).not.toHaveBeenCalled()
    expect(mocks.useWorkerImmersive).toHaveBeenCalledWith(true)
  })

  it('searches, opens a card and redeems a partial amount', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init?.method ?? 'GET'

      if (method === 'GET' && url.pathname === '/api/worker/giftcards' && url.searchParams.get('search')) {
        return { ok: true, json: async () => ({ cards: [searchCard], canManage: false }) } as Response
      }
      if (method === 'GET' && url.pathname === '/api/worker/giftcards/card-3') {
        return {
          ok: true,
          json: async () => ({
            card: {
              ...searchCard,
              history: [{ at: '2026-11-01T00:00:00.000Z', type: 'ISSUED', note: 'PDF GENERATED' }],
            },
            balance: 50,
          }),
        } as Response
      }
      if (method === 'POST' && url.pathname === '/api/worker/giftcards/card-3/redeem') {
        return {
          ok: true,
          json: async () => ({
            card: {
              ...searchCard,
              redeemedAmount: 20,
              history: [
                { at: '2026-11-01T00:00:00.000Z', type: 'ISSUED', note: 'PDF GENERATED' },
                { at: '2026-11-11T00:00:00.000Z', type: 'REDEEMED', note: 'REDEEMED $20.00 — $30.00 REMAINING' },
              ],
            },
            balance: 30,
          }),
        } as Response
      }
      return { ok: true, json: async () => moduleState } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<WorkerGiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    fireEvent.change(screen.getByPlaceholderText('SEARCH NUMBER, NAME OR EMAIL'), {
      target: { value: '2026' },
    })

    const result = await screen.findByText('20260003', {}, { timeout: 2000 })
    fireEvent.click(result)

    await screen.findByText('REMAINING BALANCE')
    expect(screen.getByText('$50.00')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('REDEEM AMOUNT'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'REDEEM' }))

    expect((await screen.findAllByText('REDEEMED $20.00 — $30.00 REMAINING')).length).toBeGreaterThan(0)
    const redeemCall = fetchMock.mock.calls.find((call) => {
      const url = new URL(String(call[0]), 'http://localhost')
      return url.pathname === '/api/worker/giftcards/card-3/redeem'
    })
    expect(JSON.parse(String((redeemCall?.[1] as RequestInit).body))).toEqual({ amount: 20 })
  })

  it('lets staff choose a specific blank card instead of taking the next number', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init?.method ?? 'GET'

      if (method === 'GET' && url.pathname === '/api/worker/giftcards' && url.searchParams.get('status') === 'DRAFT') {
        return {
          ok: true,
          json: async () => ({
            cards: [{ ...searchCard, id: 'draft-2', number: '20260002', status: 'DRAFT', amount: 0 }],
            canManage: false,
          }),
        } as Response
      }
      if (method === 'POST' && url.pathname === '/api/worker/giftcards') {
        return {
          ok: true,
          json: async () => ({ cardId: 'draft-2', number: '20260002', amount: 25 }),
        } as Response
      }
      return { ok: true, json: async () => moduleState } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<WorkerGiftCardsClient />)
    await screen.findByText('GIFT CARDS')

    fireEvent.click(screen.getByRole('button', { name: 'CHOOSE A BLANK CARD' }))
    const picked = await screen.findByText('20260002')
    fireEvent.click(picked)

    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'ISSUE GIFT CARD' }))

    await screen.findByText('GIFT CARD ISSUED')
    const issueCall = fetchMock.mock.calls.find((call) => {
      const url = new URL(String(call[0]), 'http://localhost')
      return url.pathname === '/api/worker/giftcards' && (call[1] as RequestInit)?.method === 'POST'
    })
    await waitFor(() => {
      expect(JSON.parse(String((issueCall?.[1] as RequestInit).body))).toMatchObject({
        cardId: 'draft-2',
        amount: 25,
      })
    })
  })
})
