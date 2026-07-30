/*
 * Matching a pre-order to a table reservation.
 *
 * A customer who books a table and then pre-orders online produces two
 * unconnected records for the same visit. Linking them lets the floor see the
 * order against the table the party is actually sitting at, instead of a
 * separately auto-seated one.
 *
 * Like customer matching, this errs towards leaving things unlinked: attaching
 * an order to the wrong party sends food to the wrong table, which is worse
 * than an operator linking it by hand.
 */

export interface BookingCandidate {
  id: string
  customerId?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  contactName: string
  startTime: string // "HH:mm"
  partySize: number
  status: string
}

export interface OrderToLink {
  customerId?: string | null
  customerPhone?: string | null
  customerEmail?: string | null
  customerName?: string | null
  serviceTime?: string | null
}

/** Cancelled and no-show reservations are not somewhere to send food. */
const LINKABLE_STATUSES = new Set(['CONFIRMED', 'PENDING', 'SEATED'])

function digits(v: string | null | undefined): string | null {
  if (!v) return null
  const d = v.replace(/\D/g, '')
  return d.length >= 6 ? d.slice(-8) : null // last 8 digits — country-code agnostic
}

function email(v: string | null | undefined): string | null {
  const t = v?.trim().toLowerCase()
  return t && t.includes('@') ? t : null
}

function minutes(time: string | null | undefined): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

export interface LinkMatch {
  bookingId: string
  /** How the match was made — surfaced so an operator can sanity-check it. */
  reason: 'CUSTOMER' | 'EMAIL' | 'PHONE'
}

/*
 * Best booking for an order on the same date, or null.
 *
 * Identity must match on customer record, email, or phone — never on name
 * alone. Where several bookings match the same person (a party that booked
 * twice), the one closest in time to the order wins.
 */
export function findBookingForOrder(
  order: OrderToLink,
  bookings: BookingCandidate[],
): LinkMatch | null {
  const linkable = bookings.filter((b) => LINKABLE_STATUSES.has(b.status))
  if (linkable.length === 0) return null

  const orderEmail = email(order.customerEmail)
  const orderPhone = digits(order.customerPhone)

  const scored: { booking: BookingCandidate; reason: LinkMatch['reason']; rank: number }[] = []

  for (const b of linkable) {
    if (order.customerId && b.customerId && b.customerId === order.customerId) {
      scored.push({ booking: b, reason: 'CUSTOMER', rank: 0 })
      continue
    }
    if (orderEmail && email(b.contactEmail) === orderEmail) {
      scored.push({ booking: b, reason: 'EMAIL', rank: 1 })
      continue
    }
    if (orderPhone && digits(b.contactPhone) === orderPhone) {
      scored.push({ booking: b, reason: 'PHONE', rank: 2 })
    }
  }

  if (scored.length === 0) return null

  const orderMinutes = minutes(order.serviceTime)

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    // Same strength of match — prefer the booking nearest the order's time.
    if (orderMinutes == null) return 0
    const da = Math.abs((minutes(a.booking.startTime) ?? 0) - orderMinutes)
    const db = Math.abs((minutes(b.booking.startTime) ?? 0) - orderMinutes)
    return da - db
  })

  return { bookingId: scored[0].booking.id, reason: scored[0].reason }
}

/** Minimal client surface, so this stays testable without Prisma. */
interface LinkClient {
  booking: { findMany(args: unknown): Promise<BookingCandidate[]> }
  wooOrder: { update(args: unknown): Promise<unknown> }
}

/*
 * Find and persist a booking link for an order. Best-effort: a failure here
 * must never block the order itself from saving.
 */
export async function autoLinkBooking(
  client: LinkClient,
  orderId: string,
  venueId: string,
  serviceDate: Date | null,
  order: OrderToLink,
): Promise<string | null> {
  if (!serviceDate) return null

  const bookings = await client.booking.findMany({
    where: { venueId, date: serviceDate, deletedAt: null },
    select: {
      id: true, contactPhone: true, contactEmail: true, contactName: true,
      startTime: true, partySize: true, status: true,
    },
  })

  const match = findBookingForOrder(order, bookings)
  if (!match) return null

  await client.wooOrder.update({
    where: { id: orderId },
    data: { bookingId: match.bookingId },
  })

  return match.bookingId
}
