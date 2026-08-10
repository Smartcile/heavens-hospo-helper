import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookingClient } from './BookingClient'

const deletedBooking = {
  id: 'bk-del-1',
  date: '2026-08-14',
  startTime: '19:30',
  endTime: '21:00',
  partySize: 2,
  contactName: 'SUE LANE',
  contactPhone: null,
  contactEmail: null,
  source: 'WOOCOMMERCE',
  status: 'CONFIRMED',
  notes: null,
  deletedAt: '2026-08-10T08:00:00.000Z',
  tables: [{ id: 'bt1', setupItem: { id: 'tbl-24', assignedNumber: '24', label: null } }],
  service: { id: 'svc1', name: 'DINNER' },
  orders: [],
}

describe('BookingClient deleted bookings', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
      if (url === '/api/admin/venues') return res([{ id: 'v1', name: 'TEST VENUE' }])
      if (url.startsWith('/api/admin/services')) return res([])
      if (url.includes('deleted=1')) return res([deletedBooking])
      if (url.startsWith('/api/admin/booking-tables')) return res({ tables: [], bookings: [] })
      if (url.startsWith('/api/admin/bookings?date=')) return res([])
      if (url.includes('/restore')) return res({ id: 'bk-del-1' })
      return res({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists deleted bookings under the DELETED tab and recovers one via the modal', async () => {
    render(<BookingClient role="ADMIN" sessionVenueId="" />)

    const tab = await screen.findByText('DELETED')
    fireEvent.click(tab)

    expect(await screen.findByText('SUE LANE')).toBeTruthy()
    expect(screen.getByText('19:30–21:00')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'RECOVER' }))

    // The modal shows the old seating and the restore action.
    expect(screen.getByRole('button', { name: 'RECOVER BOOKING' })).toBeTruthy()
    expect(screen.getByText('OLD TABLES')).toBeTruthy()
    // "24" appears twice: the OLD TABLES readout and the reseat chip.
    expect(screen.getAllByText('24').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'RECOVER BOOKING' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/bookings/bk-del-1/restore',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tableIds: ['tbl-24'] }),
        }),
      )
    })
  })

  it('shows the empty state when no bookings are deleted', async () => {
    vi.mocked(global.fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
      if (url === '/api/admin/venues') return res([{ id: 'v1', name: 'TEST VENUE' }])
      if (url.startsWith('/api/admin/services')) return res([])
      if (url.includes('deleted=1')) return res([])
      if (url.startsWith('/api/admin/booking-tables')) return res({ tables: [], bookings: [] })
      if (url.startsWith('/api/admin/bookings?date=')) return res([])
      return res({})
    })

    render(<BookingClient role="ADMIN" sessionVenueId="" />)
    fireEvent.click(await screen.findByText('DELETED'))
    expect(await screen.findByText('NO DELETED BOOKINGS')).toBeTruthy()
  })
})
