import { describe, it, expect } from 'vitest'
import { findBookingForOrder, type BookingCandidate } from '@/lib/order-booking-link'

function booking(over: Partial<BookingCandidate> = {}): BookingCandidate {
  return {
    id: 'b1',
    customerId: null,
    contactPhone: '021 555 1234',
    contactEmail: 'ada@example.com',
    contactName: 'ADA LOVELACE',
    startTime: '18:00',
    partySize: 4,
    status: 'CONFIRMED',
    ...over,
  }
}

describe('findBookingForOrder', () => {
  it('matches on customer record first', () => {
    const bookings = [booking({ id: 'b1', customerId: 'c1', contactEmail: null, contactPhone: null })]
    const match = findBookingForOrder({ customerId: 'c1' }, bookings)
    expect(match).toEqual({ bookingId: 'b1', reason: 'CUSTOMER' })
  })

  it('matches on email when there is no customer link', () => {
    const match = findBookingForOrder({ customerEmail: 'ADA@Example.com' }, [booking()])
    expect(match).toEqual({ bookingId: 'b1', reason: 'EMAIL' })
  })

  it('matches on phone regardless of formatting or country code', () => {
    const match = findBookingForOrder(
      { customerPhone: '+64 21 555 1234' },
      [booking({ contactEmail: null, contactPhone: '021-555-1234' })],
    )
    expect(match).toEqual({ bookingId: 'b1', reason: 'PHONE' })
  })

  it('prefers a customer match over an email match', () => {
    const bookings = [
      booking({ id: 'byEmail' }),
      booking({ id: 'byCustomer', customerId: 'c1', contactEmail: null, contactPhone: null }),
    ]
    expect(findBookingForOrder({ customerId: 'c1', customerEmail: 'ada@example.com' }, bookings)?.bookingId)
      .toBe('byCustomer')
  })

  it('never matches on name alone', () => {
    // Sending food to the wrong table is worse than leaving it unlinked.
    const bookings = [booking({ contactEmail: null, contactPhone: null })]
    expect(findBookingForOrder({ customerName: 'ADA LOVELACE' }, bookings)).toBeNull()
  })

  it('ignores cancelled and no-show reservations', () => {
    expect(findBookingForOrder({ customerEmail: 'ada@example.com' }, [booking({ status: 'CANCELLED' })])).toBeNull()
    expect(findBookingForOrder({ customerEmail: 'ada@example.com' }, [booking({ status: 'NO_SHOW' })])).toBeNull()
  })

  it('accepts confirmed, pending and seated reservations', () => {
    for (const status of ['CONFIRMED', 'PENDING', 'SEATED']) {
      expect(findBookingForOrder({ customerEmail: 'ada@example.com' }, [booking({ status })])).not.toBeNull()
    }
  })

  it('picks the booking nearest the order time when several match equally', () => {
    const bookings = [
      booking({ id: 'early', startTime: '12:00' }),
      booking({ id: 'late', startTime: '19:00' }),
    ]
    expect(findBookingForOrder({ customerEmail: 'ada@example.com', serviceTime: '18:45' }, bookings)?.bookingId)
      .toBe('late')
  })

  it('returns null when nothing matches', () => {
    expect(findBookingForOrder({ customerEmail: 'someone@else.com' }, [booking()])).toBeNull()
    expect(findBookingForOrder({}, [booking()])).toBeNull()
    expect(findBookingForOrder({ customerEmail: 'ada@example.com' }, [])).toBeNull()
  })

  it('ignores unusably short phone numbers', () => {
    const bookings = [booking({ contactEmail: null, contactPhone: '123' })]
    expect(findBookingForOrder({ customerPhone: '123' }, bookings)).toBeNull()
  })

  it('does not treat a junk email as a match key', () => {
    const bookings = [booking({ contactEmail: 'n/a', contactPhone: null })]
    expect(findBookingForOrder({ customerEmail: 'n/a' }, bookings)).toBeNull()
  })
})
