// Space availability — pure, Prisma-free merge of the things using a room on a
// single day: calendar/BEO events and bookings (group bookings and section
// holds are bookings). One room therefore has one occupancy list.
//
// Times follow existing conventions: booking start/end are venue-local "HH:mm"
// strings; calendar events are UTC wall-clock (the same values the roster grid
// uses). All-day events render as ALL DAY.

export interface SpaceAreaLike {
  id: string
  name: string
  colour?: string | null
  /** The venue that owns the room (activities may be from another shared venue). */
  ownerVenueId?: string | null
  sortOrder?: number | null
}

export interface SpaceEventLike {
  id: string
  title: string
  areaId: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  pax?: number | null
  source?: string | null
}

export interface SpaceBookingLike {
  id: string
  contactName: string
  areaId: string | null
  date: Date
  startTime: string
  endTime: string
  partySize: number
  status: string
  source: string
  /** Set when the booking was created by pushing an event; the event is deduped. */
  calendarEventId?: string | null
}

export type SpaceItemKind = 'EVENT' | 'BOOKING'

export interface SpaceItem {
  kind: SpaceItemKind
  id: string
  title: string
  /** "HH:mm", "ALL DAY", or null when an event has no end. */
  start: string
  end: string | null
  pax: number | null
  status: string | null
  source: string | null
}

export interface SpaceRoom {
  areaId: string
  name: string
  colour: string | null
  ownerVenueId: string | null
  items: SpaceItem[]
}

export interface SpaceDay {
  date: string
  rooms: SpaceRoom[]
  /** Uses with no room (or a room that no longer exists). */
  unassigned: SpaceItem[]
}

const DAY_MS = 86_400_000

function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function hhmm(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

/** Does an event occupy the given venue-local calendar day? */
export function eventOccupiesDay(event: Pick<SpaceEventLike, 'startsAt' | 'endsAt' | 'allDay'>, dayKey: string): boolean {
  const dayStart = new Date(`${dayKey}T00:00:00Z`)
  const dayEnd = new Date(dayStart.getTime() + DAY_MS)
  const start = event.startsAt
  if (start.getTime() >= dayEnd.getTime()) return false
  // No end = an open-ended hold: it occupies every day from its start onward.
  if (!event.endsAt) return true
  let end = event.endsAt
  // All-day DTEND is exclusive (the roster convention), so pull it back a day.
  if (event.allDay && end.getTime() > start.getTime()) end = new Date(end.getTime() - DAY_MS)
  return end.getTime() >= dayStart.getTime()
}

function eventItem(event: SpaceEventLike): SpaceItem {
  return {
    kind: 'EVENT',
    id: event.id,
    title: event.title,
    start: event.allDay ? 'ALL DAY' : hhmm(event.startsAt),
    end: event.endsAt && !event.allDay ? hhmm(event.endsAt) : null,
    pax: event.pax ?? null,
    status: null,
    source: event.source ?? null,
  }
}

function bookingItem(booking: SpaceBookingLike): SpaceItem {
  return {
    kind: 'BOOKING',
    id: booking.id,
    title: booking.contactName,
    start: booking.startTime,
    end: booking.endTime,
    pax: booking.partySize,
    status: booking.status,
    source: booking.source,
  }
}

function itemSortKey(item: SpaceItem): string {
  return item.start === 'ALL DAY' ? '00:00' : item.start
}

/**
 * Merge events + bookings for one day into a room-by-room view. Every known
 * room is present even when empty so the UI can offer "CREATE BOOKING" there.
 * An event already represented by a booking (booking.calendarEventId) is not
 * listed twice.
 */
export function spaceAvailabilityForDay(input: {
  date: string
  areas: SpaceAreaLike[]
  events: SpaceEventLike[]
  bookings: SpaceBookingLike[]
}): SpaceDay {
  const { date, areas, events, bookings } = input
  const byArea = new Map<string, SpaceItem[]>()

  for (const booking of bookings) {
    if (dayKeyOf(booking.date) !== date) continue
    if (booking.status === 'CANCELLED' || booking.status === 'NO_SHOW') continue
    const key = booking.areaId ?? '__unassigned__'
    const bucket = byArea.get(key) ?? []
    bucket.push(bookingItem(booking))
    byArea.set(key, bucket)
  }

  const bookedEventIds = new Set(
    bookings.map((b) => b.calendarEventId).filter((id): id is string => !!id),
  )

  for (const event of events) {
    if (bookedEventIds.has(event.id)) continue
    if (!eventOccupiesDay(event, date)) continue
    const key = event.areaId ?? '__unassigned__'
    const bucket = byArea.get(key) ?? []
    bucket.push(eventItem(event))
    byArea.set(key, bucket)
  }

  const rooms: SpaceRoom[] = areas
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    .map((area) => ({
      areaId: area.id,
      name: area.name,
      colour: area.colour ?? null,
      ownerVenueId: area.ownerVenueId ?? null,
      items: (byArea.get(area.id) ?? []).sort(
        (a, b) => itemSortKey(a).localeCompare(itemSortKey(b)) || a.title.localeCompare(b.title),
      ),
    }))

  const known = new Set(areas.map((a) => a.id))
  const unassigned: SpaceItem[] = []
  for (const [key, items] of byArea) {
    if (key !== '__unassigned__' && known.has(key)) continue
    unassigned.push(...items)
  }
  unassigned.sort(
    (a, b) => itemSortKey(a).localeCompare(itemSortKey(b)) || a.title.localeCompare(b.title),
  )

  return { date, rooms, unassigned }
}
