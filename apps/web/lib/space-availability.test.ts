import { describe, expect, it } from 'vitest'
import {
  eventOccupiesDay,
  spaceAvailabilityForDay,
  type SpaceAreaLike,
  type SpaceBookingLike,
  type SpaceEventLike,
} from './space-availability'

const AREAS: SpaceAreaLike[] = [
  { id: 'a1', name: 'DOWNSTAIRS', colour: '#111', ownerVenueId: 'v1', sortOrder: 0 },
  { id: 'a2', name: 'UPSTAIRS', colour: '#222', ownerVenueId: 'v2', sortOrder: 1 },
]

function booking(over: Partial<SpaceBookingLike> = {}): SpaceBookingLike {
  return {
    id: 'b1',
    contactName: 'SMITH',
    areaId: 'a1',
    date: new Date('2026-11-26T00:00:00Z'),
    startTime: '18:00',
    endTime: '20:00',
    partySize: 6,
    status: 'CONFIRMED',
    source: 'PHONE',
    calendarEventId: null,
    ...over,
  }
}

function event(over: Partial<SpaceEventLike> = {}): SpaceEventLike {
  return {
    id: 'e1',
    title: 'WEDDING',
    areaId: 'a1',
    startsAt: new Date('2026-11-26T17:00:00Z'),
    endsAt: new Date('2026-11-26T23:00:00Z'),
    allDay: false,
    pax: 80,
    source: 'MANUAL',
    ...over,
  }
}

const day = '2026-11-26'

describe('eventOccupiesDay', () => {
  it('matches a timed event on its day', () => {
    expect(eventOccupiesDay(event(), day)).toBe(true)
    expect(eventOccupiesDay(event(), '2026-11-27')).toBe(false)
  })

  it('treats an all-day DTEND as exclusive', () => {
    const allDay = event({
      allDay: true,
      startsAt: new Date('2026-11-26T00:00:00Z'),
      endsAt: new Date('2026-11-27T00:00:00Z'),
    })
    expect(eventOccupiesDay(allDay, day)).toBe(true)
    expect(eventOccupiesDay(allDay, '2026-11-27')).toBe(false)
  })

  it('treats a missing end as an open-ended hold from its start onward', () => {
    const openEnded = event({
      startsAt: new Date('2026-11-25T17:00:00Z'),
      endsAt: null,
    })
    expect(eventOccupiesDay(openEnded, day)).toBe(true)
    expect(eventOccupiesDay(openEnded, '2026-11-27')).toBe(true)
    expect(eventOccupiesDay(event({ startsAt: new Date('2026-11-27T17:00:00Z'), endsAt: null }), day)).toBe(false)
  })
})

describe('spaceAvailabilityForDay', () => {
  it('shows events and bookings together per room, sorted by start', () => {
    const result = spaceAvailabilityForDay({
      date: day,
      areas: AREAS,
      events: [event()],
      bookings: [booking()],
    })
    const downstairs = result.rooms.find((r) => r.areaId === 'a1')!
    expect(downstairs.items.map((i) => [i.kind, i.title, i.start])).toEqual([
      ['EVENT', 'WEDDING', '17:00'],
      ['BOOKING', 'SMITH', '18:00'],
    ])
  })

  it('keeps every room in the view even when it has nothing booked', () => {
    const result = spaceAvailabilityForDay({ date: day, areas: AREAS, events: [], bookings: [] })
    expect(result.rooms.map((r) => r.areaId)).toEqual(['a1', 'a2'])
    expect(result.rooms.every((r) => r.items.length === 0)).toBe(true)
  })

  it('puts a booking with no room into UNASSIGNED', () => {
    const result = spaceAvailabilityForDay({
      date: day,
      areas: AREAS,
      events: [],
      bookings: [booking({ areaId: null })],
    })
    expect(result.rooms.every((r) => r.items.length === 0)).toBe(true)
    expect(result.unassigned).toHaveLength(1)
    expect(result.unassigned[0]).toMatchObject({ kind: 'BOOKING', title: 'SMITH' })
  })

  it('does not list an event twice when a booking already represents it', () => {
    const result = spaceAvailabilityForDay({
      date: day,
      areas: AREAS,
      events: [event({ id: 'e1' })],
      bookings: [booking({ id: 'b1', calendarEventId: 'e1' })],
    })
    const downstairs = result.rooms.find((r) => r.areaId === 'a1')!
    expect(downstairs.items.map((i) => i.kind)).toEqual(['BOOKING'])
  })

  it('ignores cancelled/no-show bookings and other days', () => {
    const result = spaceAvailabilityForDay({
      date: day,
      areas: AREAS,
      events: [],
      bookings: [
        booking({ id: 'b1', status: 'CANCELLED' }),
        booking({ id: 'b2', status: 'NO_SHOW' }),
        booking({ id: 'b3', date: new Date('2026-11-27T00:00:00Z') }),
      ],
    })
    expect(result.rooms.every((r) => r.items.length === 0)).toBe(true)
    expect(result.unassigned).toHaveLength(0)
  })

  it('puts a use against an unknown room into UNASSIGNED', () => {
    const result = spaceAvailabilityForDay({
      date: day,
      areas: AREAS,
      events: [],
      bookings: [booking({ areaId: 'gone' })],
    })
    expect(result.unassigned).toHaveLength(1)
  })
})
