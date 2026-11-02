import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PipelinePanel } from '@/components/admin/PipelinePanel'

const EVENTS = [
  {
    id: 'e1',
    name: 'SMITH WEDDING',
    eventType: 'WEDDING',
    status: 'ENQUIRY',
    eventDate: '2026-11-14',
    guestCount: 96,
    blocks: [{ id: 'b1', type: 'NOTES', title: null, config: { text: 'ALLERGY NOTE' }, sortOrder: 0 }],
  },
]

function mockFetch(events = EVENTS) {
  return vi.fn((url: string) => {
    if (String(url).startsWith('/api/admin/events')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(events) })
    }
    if (String(url).startsWith('/api/admin/beo-block-defs')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ guides: [], tasks: [], checklists: [] }) })
  }) as unknown as typeof fetch
}

describe('PipelinePanel', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('shows events in their status column', async () => {
    render(<PipelinePanel sessionVenueId="v1" onOpenEvent={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())
    expect(screen.getByText('ENQUIRY')).toBeTruthy()
    expect(screen.getByText('CONFIRMED')).toBeTruthy()
  })

  it('opens an event and renders its auto-derived flow', async () => {
    render(<PipelinePanel sessionVenueId="v1" onOpenEvent={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())

    fireEvent.click(screen.getByTestId('pipeline-card'))
    await waitFor(() => expect(screen.getByText(/PLANNING/)).toBeTruthy())
    expect(screen.getByText(/PREP/)).toBeTruthy()
    expect(screen.getByText(/EVENT DAY/)).toBeTruthy()
    expect(screen.getByText('NOTES')).toBeTruthy()
    expect(screen.getByText('OPEN BEO')).toBeTruthy()
  })
})
