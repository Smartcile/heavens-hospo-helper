import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OrderDetailDrawer } from './OrderDetailDrawer'
import type { OrderView } from '@/lib/order-views'

function order(overrides: Partial<OrderView> = {}): OrderView {
  return {
    id: 'o1',
    ref: '#42',
    source: 'WOO',
    customerName: 'JANE SMITH',
    customerPhone: null,
    customerEmail: 'jane@example.com',
    serviceDate: '2026-08-14',
    serviceTime: '18:30',
    partySize: 4,
    fulfillmentType: 'DINE_IN',
    opStatus: 'NEW',
    status: 'PROCESSING',
    paymentStatus: 'UNPAID',
    paymentMethod: null,
    totalAmount: 80,
    allergenNote: null,
    notes: null,
    menuName: null,
    bookingId: null,
    booking: null,
    tables: [],
    items: [],
    ...overrides,
  }
}

const ok = () => ({ ok: true, json: async () => ({}) } as Response)

describe('OrderDetailDrawer booking controls', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(global, 'fetch').mockResolvedValue(ok())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a booking for a dine-in order that has none', async () => {
    const onChanged = vi.fn()
    render(<OrderDetailDrawer order={order()} onClose={() => {}} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: 'CREATE BOOKING' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/orders/o1/booking', expect.objectContaining({ method: 'POST' }))
    })
    expect(onChanged).toHaveBeenCalled()
  })

  it('edits the linked booking time and party size in place', async () => {
    const onChanged = vi.fn()
    render(
      <OrderDetailDrawer
        order={order({
          bookingId: 'bk1',
          booking: { id: 'bk1', date: '2026-08-14', startTime: '18:30', endTime: '20:00', partySize: 4, contactName: 'JANE SMITH', tables: ['24'] },
          tables: ['24'],
        })}
        onClose={() => {}}
        onChanged={onChanged}
      />,
    )

    expect(screen.getByText('18:30–20:00')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'EDIT BOOKING' }))
    fireEvent.click(screen.getByRole('button', { name: 'SAVE BOOKING' }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/admin/bookings/bk1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ startTime: '18:30', endTime: '20:00', partySize: 4 }),
        }),
      )
    })
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows no booking controls for pickup — time only, no pax', () => {
    render(
      <OrderDetailDrawer
        order={order({ fulfillmentType: 'PICKUP', partySize: null })}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    )
    expect(screen.getByText('PICKUP TIME')).toBeTruthy()
    expect(screen.queryByText('PARTY')).toBeNull()
    expect(screen.queryByText('BOOKING')).toBeNull()
    expect(screen.queryByRole('button', { name: 'CREATE BOOKING' })).toBeNull()
  })

  it('shows only a delivery time for delivery — no pax, no booking', () => {
    render(
      <OrderDetailDrawer
        order={order({ fulfillmentType: 'DELIVERY', partySize: null })}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    )
    expect(screen.getByText('DELIVERY TIME')).toBeTruthy()
    expect(screen.queryByText('PARTY')).toBeNull()
    expect(screen.queryByText('BOOKING')).toBeNull()
  })
})
