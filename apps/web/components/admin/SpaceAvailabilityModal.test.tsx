import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SpaceAvailabilityModal } from './SpaceAvailabilityModal'

const VIEW = {
  date: '2026-11-26',
  rooms: [
    {
      areaId: 'a1',
      name: 'FUNCTION ROOM',
      colour: null,
      ownerVenueId: 'v2',
      items: [
        { kind: 'EVENT', id: 'e1', title: 'WEDDING', start: '17:00', end: '23:00', pax: 80, status: null, source: 'MANUAL' },
        { kind: 'BOOKING', id: 'b1', title: 'SMITH', start: '18:00', end: '20:00', pax: 6, status: 'CONFIRMED', source: 'PHONE' },
      ],
    },
  ],
  unassigned: [],
}

function mockFetch() {
  return vi.spyOn(global, 'fetch').mockImplementation(async (url: unknown, init?: RequestInit) => {
    if (String(url).includes('/api/admin/space-availability')) {
      return { ok: true, json: async () => VIEW } as Response
    }
    if (String(url).includes('/api/admin/bookings') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ id: 'b2' }) } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  })
}

beforeEach(() => {
  mockFetch()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SpaceAvailabilityModal', () => {
  it('shows events and bookings together for a shared room', async () => {
    render(<SpaceAvailabilityModal venueId="v1" initialDate="2026-11-26" onClose={() => {}} />)
    await screen.findByText('WEDDING')
    expect(screen.getByText('SMITH')).toBeTruthy()
    expect(screen.getByText('SHARED')).toBeTruthy()
  })

  it('creates a booking against the room (a space hold)', async () => {
    render(<SpaceAvailabilityModal venueId="v1" initialDate="2026-11-26" onClose={() => {}} />)
    await screen.findByText('WEDDING')

    fireEvent.click(screen.getByText('+ CREATE BOOKING'))
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'JONES' } })
    fireEvent.click(screen.getByText('SAVE BOOKING'))

    await waitFor(() => {
      const post = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        ([url, init]) => String(url).includes('/api/admin/bookings') && (init as RequestInit)?.method === 'POST',
      )
      expect(post).toBeTruthy()
      const body = JSON.parse((post![1] as RequestInit).body as string)
      expect(body).toMatchObject({ hold: true, areaId: 'a1', contactName: 'JONES', date: '2026-11-26' })
    })
  })
})
