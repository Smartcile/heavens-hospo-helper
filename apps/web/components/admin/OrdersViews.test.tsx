import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AllOrdersView, ServiceView } from '@/components/admin/OrdersViews'
import type { OrderView } from '@/lib/order-views'

function order(overrides: Partial<OrderView>): OrderView {
  return {
    id: 'o1',
    ref: '#42',
    source: 'WOO',
    customerName: 'JANE SMITH',
    customerPhone: '0215551234',
    customerEmail: 'jane@example.com',
    serviceTime: '18:30',
    partySize: 4,
    fulfillmentType: 'DINE_IN',
    opStatus: 'NEW',
    status: 'PROCESSING',
    paymentStatus: 'PAID',
    paymentMethod: 'CARD',
    totalAmount: 120.5,
    allergenNote: null,
    notes: null,
    menuName: null,
    bookingId: null,
    tables: [],
    items: [],
    ...overrides,
  }
}

describe('AllOrdersView', () => {
  // The whole point of the ALL view: undated orders (which no day view can
  // show) must still be visible with a clear NO DATE badge.
  it('marks undated orders with a NO DATE badge', () => {
    render(
      <AllOrdersView
        orders={[order({ id: 'u1', ref: '#1', serviceDate: null, serviceTime: null })]}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('NO DATE')).toBeTruthy()
    expect(screen.getByText('#1')).toBeTruthy()
  })

  it('shows the service date for dated orders', () => {
    render(
      <AllOrdersView
        orders={[order({ serviceDate: '2026-08-07', serviceTime: '18:30' })]}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('2026-08-07')).toBeTruthy()
    expect(screen.getByText('18:30')).toBeTruthy()
  })

  // "See orders even if they are not assigned bookings" — the booking state
  // must be visible at a glance, in both directions.
  it('shows BOOKED for a linked order and NO BOOKING for an unlinked one', () => {
    render(
      <AllOrdersView
        orders={[
          order({ id: 'b1', ref: '#10', bookingId: 'bk-1' }),
          order({ id: 'b2', ref: '#11', bookingId: null }),
        ]}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('◆ BOOKED')).toBeTruthy()
    expect(screen.getByText('NO BOOKING')).toBeTruthy()
  })

  it('opens the detail drawer when a row is clicked', () => {
    const onOpen = vi.fn()
    render(<AllOrdersView orders={[order({ id: 'c1' })]} onOpen={onOpen} />)
    fireEvent.click(screen.getByText('#42'))
    expect(onOpen).toHaveBeenCalledWith('c1')
  })

  it('shows an empty state when nothing has synced', () => {
    render(<AllOrdersView orders={[]} onOpen={() => {}} />)
    expect(screen.getByText(/NO SYNCED ORDERS YET/)).toBeTruthy()
  })
})

describe('ServiceView', () => {
  // A week selection fetches every day in one payload — the cards must show
  // which day each order belongs to, or the slots become ambiguous.
  it('shows the service date on cards when orders span multiple days', () => {
    render(
      <ServiceView
        orders={[
          order({ id: 'a1', ref: '#1', serviceDate: '2026-08-10', serviceTime: '17:00' }),
          order({ id: 'a2', ref: '#2', serviceDate: '2026-08-14', serviceTime: '17:00' }),
        ]}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('2026-08-10')).toBeTruthy()
    expect(screen.getByText('2026-08-14')).toBeTruthy()
  })

  it('omits the date chip for a single-day payload', () => {
    render(
      <ServiceView
        orders={[order({ id: 'b1', ref: '#3', serviceDate: '2026-08-14', serviceTime: '17:00' })]}
        onOpen={() => {}}
      />,
    )
    expect(screen.queryByText('2026-08-14')).toBeNull()
  })
})
