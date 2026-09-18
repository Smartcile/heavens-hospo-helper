import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { EnquiriesPanel } from '@/components/admin/EnquiriesPanel'

const ENQUIRIES = [
  {
    id: 'e1',
    name: 'SMITH WEDDING',
    eventType: 'WEDDING',
    status: 'ENQUIRY',
    eventDate: '2026-11-14',
    guestCount: 96,
    contactName: 'JANE SMITH',
    contactEmail: null,
    contactPhone: '021 555 0100',
    notes: null,
    blocks: [
      { id: 'b1', type: 'CUSTOMER_DETAILS', title: null, config: {}, sortOrder: 0 },
    ],
  },
]

function mockFetch(enquiries = ENQUIRIES) {
  return vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    if (String(url).startsWith('/api/admin/enquiries')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(enquiries) })
    }
    if (String(url).startsWith('/api/admin/beo-block-defs')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
  }) as unknown as typeof fetch
}

function calls() {
  return (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
}

describe('EnquiriesPanel', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('lists enquiries with contact details', async () => {
    render(<EnquiriesPanel sessionVenueId="v1" onConverted={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())
    expect(screen.getByText(/JANE SMITH/)).toBeTruthy()
    expect(screen.getByText('ENQUIRY')).toBeTruthy()
  })

  it('shows an empty state when there are no enquiries', async () => {
    globalThis.fetch = mockFetch([])
    render(<EnquiriesPanel sessionVenueId="v1" onConverted={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('NO ENQUIRIES YET.')).toBeTruthy())
  })

  it('POSTs a new enquiry', async () => {
    render(<EnquiriesPanel sessionVenueId="v1" onConverted={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())

    fireEvent.click(screen.getByText('+ NEW ENQUIRY'))
    fireEvent.change(screen.getByPlaceholderText('SMITH WEDDING'), { target: { value: 'JONES 50TH' } })
    fireEvent.click(screen.getByText('CREATE ENQUIRY'))

    await waitFor(() => {
      const post = calls().find(
        (c) => String(c[0]).endsWith('/api/admin/enquiries') && (c[1] as { method?: string })?.method === 'POST',
      )
      expect(post).toBeTruthy()
      expect(JSON.parse((post![1] as { body: string }).body)).toMatchObject({
        venueId: 'v1',
        name: 'JONES 50TH',
      })
    })
  })

  it('opens an enquiry, then converts it to a BEO', async () => {
    const onConverted = vi.fn()
    render(<EnquiriesPanel sessionVenueId="v1" onConverted={onConverted} />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())

    fireEvent.click(screen.getByTestId('enquiry-card'))
    await waitFor(() => expect(screen.getByText('CONVERT TO BEO')).toBeTruthy())

    fireEvent.click(screen.getByText('CONVERT TO BEO'))
    await waitFor(() => {
      const convert = calls().find((c) => String(c[0]).endsWith('/api/admin/events/e1/convert'))
      expect(convert).toBeTruthy()
      expect((convert![1] as { method?: string }).method).toBe('POST')
    })
    await waitFor(() => expect(onConverted).toHaveBeenCalledWith('e1'))
  })
})
