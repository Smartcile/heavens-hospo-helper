import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CustomerDrawer } from './CustomerDrawer'

const customerRow = {
  phone: '021 555 1234', name: 'SUE LANE', email: 'sue@example.com',
  lastBooking: '2026-08-14', totalBookings: 3, totalPax: 7,
}
const bookingRow = {
  id: 'bk-1', date: '2026-08-14T00:00:00.000Z', startTime: '19:30', endTime: '21:00',
  partySize: 2, status: 'CONFIRMED',
}

describe('CustomerDrawer', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      const res = (data: unknown) => ({ ok: true, json: async () => data }) as Response
      if (url.startsWith('/api/admin/customers')) return res([customerRow])
      if (url.startsWith('/api/admin/bookings')) return res([bookingRow])
      return res({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    render(<CustomerDrawer isOpen={false} onClose={() => {}} name="SUE LANE" />)
    expect(screen.queryByText('CUSTOMER DETAILS')).toBeNull()
  })

  it('loads the customer profile and bookings when opened', async () => {
    render(<CustomerDrawer isOpen onClose={() => {}} name="SUE LANE" phone="021 555 1234" />)
    expect(await screen.findByText('SUE LANE')).toBeTruthy()
    expect(await screen.findByText('021 555 1234')).toBeTruthy()
    expect(screen.getByText('sue@example.com')).toBeTruthy()
    expect(screen.getByText('3 BOOKINGS · 7 PAX TOTAL')).toBeTruthy()
    expect(screen.getByText(/19:30–21:00/)).toBeTruthy()
  })

  it('passes the venue id when provided', async () => {
    render(<CustomerDrawer isOpen onClose={() => {}} name="SUE LANE" venueId="v1" />)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/customers?search=SUE+LANE&venueId=v1',
      )
    })
  })

  it('closes via the backdrop click', async () => {
    const onClose = vi.fn()
    render(<CustomerDrawer isOpen onClose={onClose} name="SUE LANE" />)
    await screen.findByText('SUE LANE')
    fireEvent.click(document.querySelector('.bg-black\\/70')!)
    expect(onClose).toHaveBeenCalled()
  })
})
