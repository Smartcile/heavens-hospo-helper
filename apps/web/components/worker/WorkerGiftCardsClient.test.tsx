import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
})
