import { describe, expect, it } from 'vitest'
import {
  runAreaSharingBackfill,
  type AreaSharingArea,
  type AreaSharingBooking,
  type AreaSharingEvent,
  type AreaSharingStore,
} from '../../../packages/db/prisma/area-sharing-migration'

function area(over: Partial<AreaSharingArea> = {}): AreaSharingArea {
  return { id: 'a1', venueId: 'v1', deletedAt: null, ...over }
}
function booking(over: Partial<AreaSharingBooking> = {}): AreaSharingBooking {
  return { id: 'b1', areaId: null, seatingSetupId: 's1', deletedAt: null, ...over }
}
function event(over: Partial<AreaSharingEvent> = {}): AreaSharingEvent {
  return { id: 'e1', areaId: null, setupId: 's1', deletedAt: null, ...over }
}

function fakeStore(opts: {
  areas?: AreaSharingArea[]
  bookings?: AreaSharingBooking[]
  events?: AreaSharingEvent[]
  setupAreas?: Record<string, string | null>
}) {
  const areas = (opts.areas ?? [area()]).map((a) => ({ ...a }))
  const bookings = (opts.bookings ?? []).map((b) => ({ ...b }))
  const events = (opts.events ?? []).map((e) => ({ ...e }))
  const links = new Map<string, { areaId: string; venueId: string; isOwner: boolean }>()
  const setupAreas = opts.setupAreas ?? { s1: 'a1' }
  const writes: { kind: 'booking' | 'event'; id: string; areaId: string }[] = []

  const store: AreaSharingStore = {
    listAreas: async () => areas,
    ensureOwnerLink: async (areaId, venueId) => {
      links.set(`${areaId}:${venueId}`, { areaId, venueId, isOwner: true })
    },
    listBookings: async () => bookings,
    listEvents: async () => events,
    setupAreaId: async (setupId) => setupAreas[setupId] ?? null,
    setBookingArea: async (bookingId, areaId) => {
      const row = bookings.find((b) => b.id === bookingId)
      if (row) row.areaId = areaId
      writes.push({ kind: 'booking', id: bookingId, areaId })
    },
    setEventArea: async (eventId, areaId) => {
      const row = events.find((e) => e.id === eventId)
      if (row) row.areaId = areaId
      writes.push({ kind: 'event', id: eventId, areaId })
    },
  }

  return { store, areas, bookings, events, links, writes }
}

describe('runAreaSharingBackfill', () => {
  it('gives every live area an owner link', async () => {
    const fake = fakeStore({ areas: [area({ id: 'a1', venueId: 'v1' }), area({ id: 'a2', venueId: 'v2' })] })
    const result = await runAreaSharingBackfill(fake.store)
    expect(result.ownerLinks).toBe(2)
    expect(fake.links.get('a1:v1')).toMatchObject({ isOwner: true })
    expect(fake.links.get('a2:v2')).toMatchObject({ isOwner: true })
  })

  it('backfills a booking and an event from their setup area', async () => {
    const fake = fakeStore({
      bookings: [booking({ id: 'b1', seatingSetupId: 's1' })],
      events: [event({ id: 'e1', setupId: 's1' })],
      setupAreas: { s1: 'a1' },
    })
    const result = await runAreaSharingBackfill(fake.store)
    expect(result.bookingsBackfilled).toBe(1)
    expect(result.eventsBackfilled).toBe(1)
    expect(fake.bookings[0].areaId).toBe('a1')
    expect(fake.events[0].areaId).toBe('a1')
  })

  it('skips soft-deleted areas, bookings and events', async () => {
    const fake = fakeStore({
      areas: [area({ deletedAt: new Date() })],
      bookings: [booking({ deletedAt: new Date() })],
      events: [event({ deletedAt: new Date() })],
    })
    const result = await runAreaSharingBackfill(fake.store)
    expect(result).toEqual({ ownerLinks: 0, bookingsBackfilled: 0, eventsBackfilled: 0 })
    expect(fake.links.size).toBe(0)
    expect(fake.writes).toHaveLength(0)
  })

  it('leaves rows with no setup (or an unlinked setup) alone', async () => {
    const fake = fakeStore({
      bookings: [booking({ id: 'b1', seatingSetupId: null }), booking({ id: 'b2', seatingSetupId: 'missing' })],
      events: [event({ id: 'e1', setupId: null })],
      setupAreas: {},
    })
    const result = await runAreaSharingBackfill(fake.store)
    expect(result.bookingsBackfilled).toBe(0)
    expect(result.eventsBackfilled).toBe(0)
    expect(fake.writes).toHaveLength(0)
  })

  it('is a no-op on a second run', async () => {
    const fake = fakeStore({
      bookings: [booking()],
      events: [event()],
    })
    await runAreaSharingBackfill(fake.store)
    const second = await runAreaSharingBackfill(fake.store)
    expect(second).toEqual({ ownerLinks: 1, bookingsBackfilled: 0, eventsBackfilled: 0 })
    expect(fake.writes).toHaveLength(2)
  })
})
