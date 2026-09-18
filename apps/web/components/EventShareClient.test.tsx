import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EventShareClient } from '@/components/EventShareClient'
import type { PublicEventView } from '@/lib/event-share'

const VIEW: PublicEventView = {
  name: 'SMITH WEDDING',
  eventType: 'WEDDING',
  status: 'CONFIRMED',
  eventDate: '2026-11-14',
  startTime: '16:00',
  endTime: '23:00',
  guestCount: 96,
  diningStyle: 'PLATED',
  venueName: 'AKARANA EATERY',
  contactName: 'JANE SMITH',
  menuName: 'WEDDING MENU',
  setupName: 'WEDDING RECEPTION',
  blocks: [
    { id: 'b1', type: 'TIMELINE', title: null, config: { rows: [{ time: '18:00', label: 'MAINS' }] } },
    { id: 'b2', type: 'MENU_SELECTION', title: null, config: { items: [{ menuItemId: 'm1', qty: 2 }] } },
  ],
  menuItems: [{ id: 'm1', name: 'ROAST LAMB' }],
  totals: {
    subtotal: 85,
    deposit: 50,
    balance: 35,
    lines: [{ menuItemId: 'm1', name: 'ROAST LAMB', qty: 2, unitPrice: 42.5, total: 85 }],
  },
  approvedAt: null,
  approvedByName: null,
  requests: [],
}

function mockFetch(getOk = true) {
  return vi.fn((url: string) => {
    if (String(url).endsWith('/request')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'r1' }) })
    }
    if (!getOk) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })
    return Promise.resolve({ ok: true, json: () => Promise.resolve(VIEW) })
  }) as unknown as typeof fetch
}

describe('EventShareClient', () => {
  beforeEach(() => { globalThis.fetch = mockFetch() })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders the event, its blocks and the pricing summary', async () => {
    render(<EventShareClient token="tok" />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())
    expect(screen.getByText('AKARANA EATERY')).toBeTruthy()
    // The menu block resolves the item id to its name (it also appears in the
    // order summary, so allow more than one match).
    expect(screen.getAllByText(/ROAST LAMB/).length).toBeGreaterThan(0)
    expect(screen.getByText('$35.00')).toBeTruthy()
  })

  it('shows the unavailable state for a dead link', async () => {
    globalThis.fetch = mockFetch(false)
    render(<EventShareClient token="tok" />)
    await waitFor(() => expect(screen.getByText('LINK NOT AVAILABLE')).toBeTruthy())
  })

  it('refuses to send an empty edit request', async () => {
    render(<EventShareClient token="tok" />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())
    fireEvent.click(screen.getByText('SEND REQUEST'))
    expect(screen.getByText('PLEASE DESCRIBE THE CHANGE YOU NEED')).toBeTruthy()
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls.some((c) => String(c[0]).endsWith('/request'))).toBe(false)
  })

  it('posts an edit request with the message and kind', async () => {
    render(<EventShareClient token="tok" />)
    await waitFor(() => expect(screen.getByText('SMITH WEDDING')).toBeTruthy())

    fireEvent.change(screen.getByPlaceholderText('COULD WE ADD TWO MORE VEGETARIAN MAINS?'), {
      target: { value: 'ADD TWO VEGAN MAINS' },
    })
    fireEvent.click(screen.getByText('SEND REQUEST'))

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls
      const post = calls.find((c) => String(c[0]).endsWith('/request'))
      expect(post).toBeTruthy()
      expect(JSON.parse((post![1] as { body: string }).body)).toMatchObject({
        kind: 'EDIT',
        message: 'ADD TWO VEGAN MAINS',
      })
    })
  })
})
