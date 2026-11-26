import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('@/components/ui/PdfViewerModal', () => ({ PdfViewerModal: () => null }))

import { BreachNoticesPanel } from './BreachNoticesPanel'

const fetchMock = vi.fn()

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function row(overrides: Record<string, unknown>) {
  return {
    id: 'n1',
    subjectType: 'STAFF',
    kind: 'PARKING',
    numberplate: 'ABC123',
    noticeDetails: 'Ticket 998877',
    breachDate: '2026-11-01T00:00:00.000Z',
    location: 'MARINA',
    issuingAuthority: 'COUNCIL',
    fineAmount: 95,
    paymentDueDate: null,
    notes: null,
    clientName: null,
    clientReference: null,
    attachmentUrls: ['/api/upload/photo.jpg'],
    status: 'SUBMITTED',
    reviewNote: null,
    reviewedAt: null,
    submittedByName: 'Alex Smith',
    subjectStaffName: 'Alex Smith',
    reviewedByName: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  }
}

const STAFF = row({})
const CLIENT = row({ id: 'n2', subjectType: 'CLIENT', numberplate: 'XYZ999', clientName: 'Pat', clientReference: 'C1' })

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BreachNoticesPanel', () => {
  it('lists notices and filters by subject', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.startsWith('/api/admin/breach-notices?')) return json({ items: [STAFF, CLIENT], canReview: true })
      return json({})
    })
    render(<BreachNoticesPanel role="MANAGER" sessionVenueId="v1" />)
    expect(await screen.findByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('XYZ999')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'CLIENT' }))
    expect(screen.queryByText('ABC123')).toBeNull()
    expect(screen.getByText('XYZ999')).toBeInTheDocument()
  })

  it('requires a reason before a decision', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url)
      if (u.startsWith('/api/admin/breach-notices?')) return json({ items: [STAFF], canReview: true })
      return json({})
    })
    render(<BreachNoticesPanel role="MANAGER" sessionVenueId="v1" />)
    await screen.findByText('ABC123')
    fireEvent.click(screen.getByText('ABC123'))
    fireEvent.click(screen.getByRole('button', { name: 'WAIVE' }))

    expect(await screen.findByText('ADD A REASON FOR THIS DECISION')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === 'POST')).toBe(false)
  })

  it('shows a failed decision inline', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.startsWith('/api/admin/breach-notices?') && (init?.method ?? 'GET') === 'GET') {
        return json({ items: [STAFF], canReview: true })
      }
      if (u.includes('/review') && init?.method === 'POST') {
        return json({ error: 'THIS NOTICE HAS ALREADY BEEN CLOSED' }, 409)
      }
      return json({})
    })
    render(<BreachNoticesPanel role="MANAGER" sessionVenueId="v1" />)
    await screen.findByText('ABC123')
    fireEvent.click(screen.getByText('ABC123'))
    fireEvent.change(screen.getByPlaceholderText(/Why this notice/), { target: { value: 'goodwill' } })
    fireEvent.click(screen.getByRole('button', { name: 'DECLINE' }))

    expect(await screen.findByText('THIS NOTICE HAS ALREADY BEEN CLOSED')).toBeInTheDocument()
  })
})
