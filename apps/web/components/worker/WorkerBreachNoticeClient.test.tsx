import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))
vi.mock('@/components/ui/PdfViewerModal', () => ({ PdfViewerModal: () => null }))

import { WorkerBreachNoticeClient } from './WorkerBreachNoticeClient'

const fetchMock = vi.fn()

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

const ACCESS_STAFF = { allowed: true, venueWide: false, canReview: false, canSubmitClient: false }
const ACCESS_MANAGER = { allowed: true, venueWide: true, canReview: true, canSubmitClient: true }

const ROW = {
  id: 'n1',
  subjectType: 'CLIENT',
  kind: 'PARKING',
  numberplate: 'ABC123',
  noticeDetails: 'Ticket 998877',
  breachDate: '2026-11-01T00:00:00.000Z',
  location: null,
  issuingAuthority: null,
  fineAmount: 95,
  paymentDueDate: null,
  notes: null,
  clientName: 'Pat',
  clientReference: 'C1',
  attachmentUrls: ['/api/upload/photo.jpg'],
  status: 'SUBMITTED',
  reviewNote: null,
  reviewedAt: null,
  submittedByName: 'Alex Smith',
  reviewedByName: null,
}

beforeEach(() => {
  fetchMock.mockReset()
  pushMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WorkerBreachNoticeClient', () => {
  it('blocks a submit with no photo', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url) === '/api/worker/breach-notices') return json({ ...ACCESS_STAFF, items: [] })
      return json({})
    })
    render(<WorkerBreachNoticeClient />)
    await screen.findByText('BREACH NOTICES')

    fireEvent.click(screen.getByRole('button', { name: '+ NEW' }))
    fireEvent.change(screen.getByPlaceholderText('ABC123'), { target: { value: 'abc123' } })
    fireEvent.change(screen.getByPlaceholderText(/Ticket/), { target: { value: 'Ticket 998877' } })
    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT NOTICE' }))

    expect(await screen.findByText('ADD AT LEAST ONE PHOTO OF THE NOTICE')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'POST')).toBe(false)
  })

  it('lets a manager submit a client notice and resolve it immediately', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'
      if (u === '/api/worker/breach-notices' && method === 'GET') return json({ ...ACCESS_MANAGER, items: [ROW] })
      if (u === '/api/worker/breach-notices/attachment') return json({ url: '/api/upload/photo.jpg' }, 201)
      if (u === '/api/worker/breach-notices' && method === 'POST') return json({ notice: { id: 'n1' } }, 201)
      if (u === '/api/worker/breach-notices/n1' && method === 'GET') return json(ROW)
      if (u === '/api/worker/breach-notices/n1/review') return json({ notice: ROW })
      return json({})
    })

    render(<WorkerBreachNoticeClient />)
    await screen.findByText('BREACH NOTICES')
    fireEvent.click(screen.getByRole('button', { name: '+ NEW' }))

    // The manager form defaults to CLIENT and offers both subjects.
    expect(screen.getByRole('button', { name: 'STAFF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CLIENT' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('ABC123'), { target: { value: 'abc123' } })
    fireEvent.change(screen.getByPlaceholderText(/Ticket/), { target: { value: 'Ticket 998877' } })

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'ticket.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/attachment'))).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'SUBMIT NOTICE' }))

    await waitFor(() => {
      const create = fetchMock.mock.calls.find(
        ([u, init]) => String(u) === '/api/worker/breach-notices' && (init as RequestInit)?.method === 'POST',
      )
      expect(create).toBeTruthy()
      expect(JSON.parse(String((create?.[1] as RequestInit).body))).toMatchObject({
        subjectType: 'CLIENT',
        attachmentUrls: ['/api/upload/photo.jpg'],
      })
    })

    // The submitted notice opens with the manager review controls.
    expect(await screen.findByRole('button', { name: 'WAIVE' })).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Why this notice/), { target: { value: 'Venue waived it' } })
    fireEvent.click(screen.getByRole('button', { name: 'WAIVE' }))

    await waitFor(() => {
      const review = fetchMock.mock.calls.find(([u]) => String(u).endsWith('/review'))
      expect(review).toBeTruthy()
      expect(JSON.parse(String((review?.[1] as RequestInit).body))).toMatchObject({
        action: 'WAIVE',
        note: 'Venue waived it',
      })
    })
  })

  it('requires a reason before a manager decision', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u === '/api/worker/breach-notices') return json({ ...ACCESS_MANAGER, items: [ROW] })
      if (u === '/api/worker/breach-notices/n1') return json(ROW)
      return json({})
    })
    render(<WorkerBreachNoticeClient initialId="n1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'DECLINE' }))
    expect(await screen.findByText('ADD A REASON FOR THIS DECISION')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/review'))).toBe(false)
  })
})
