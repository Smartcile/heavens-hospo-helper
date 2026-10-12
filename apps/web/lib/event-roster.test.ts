import { describe, it, expect } from 'vitest'
import {
  OTHER_ROOM_KEY,
  formatEventTime,
  roomKeyForEvent,
  eventDayKeysInRange,
  buildRoomGrid,
  type RosterFeedLike,
  type RosterEventLike,
} from '@/lib/event-roster'

const feeds: RosterFeedLike[] = [
  { id: 'feed-1', name: 'TE KAWAU ROOM', colour: null, floorPlanSlug: 'te-kawau' },
  { id: 'feed-2', name: 'RANGITOTO ROOM', colour: null, floorPlanSlug: null },
]

function event(partial: Partial<RosterEventLike> & { id: string }): RosterEventLike {
  return {
    feedId: null,
    location: null,
    floorPlanSlug: null,
    startsAt: new Date('2025-11-15T09:00:00Z'),
    endsAt: null,
    allDay: false,
    title: 'EVENT',
    ...partial,
  }
}

describe('formatEventTime', () => {
  it('formats UTC wall-clock and all-day', () => {
    expect(formatEventTime({ startsAt: new Date('2025-11-15T18:30:00Z'), allDay: false })).toBe('18:30')
    expect(formatEventTime({ startsAt: new Date('2025-11-15T00:00:00Z'), allDay: true })).toBe('ALL DAY')
  })
})

describe('roomKeyForEvent', () => {
  it('uses the feed first', () => {
    expect(roomKeyForEvent({ feedId: 'feed-2', location: null, floorPlanSlug: null }, feeds)).toBe('feed-2')
  })

  it('matches LOCATION against feed names', () => {
    expect(roomKeyForEvent({ feedId: null, location: 'Te Kawau Room', floorPlanSlug: null }, feeds)).toBe('feed-1')
  })

  it('matches the floor plan slug', () => {
    expect(roomKeyForEvent({ feedId: null, location: null, floorPlanSlug: 'te-kawau' }, feeds)).toBe('feed-1')
  })

  it('falls back to OTHER', () => {
    expect(roomKeyForEvent({ feedId: 'gone', location: null, floorPlanSlug: null }, feeds)).toBe(OTHER_ROOM_KEY)
  })
})

describe('eventDayKeysInRange', () => {
  it('lists every day a multi-day event covers, clamped to the range', () => {
    const keys = eventDayKeysInRange(
      { startsAt: new Date('2025-11-14T15:00:00Z'), endsAt: new Date('2025-11-17T10:00:00Z'), allDay: false },
      '2025-11-15',
      '2025-11-16',
    )
    expect(keys).toEqual(['2025-11-15', '2025-11-16'])
  })

  it('treats all-day DTEND as exclusive', () => {
    const keys = eventDayKeysInRange(
      { startsAt: new Date('2025-11-15T00:00:00Z'), endsAt: new Date('2025-11-16T00:00:00Z'), allDay: true },
      '2025-11-10',
      '2025-11-20',
    )
    expect(keys).toEqual(['2025-11-15'])
  })

  it('drops events outside the range', () => {
    const keys = eventDayKeysInRange(
      { startsAt: new Date('2025-11-01T09:00:00Z'), endsAt: null, allDay: false },
      '2025-11-15',
      '2025-11-21',
    )
    expect(keys).toEqual([])
  })
})

describe('buildRoomGrid', () => {
  it('groups events by room and day, sorted by start time', () => {
    const grid = buildRoomGrid(
      feeds,
      [
        event({ id: 'e2', feedId: 'feed-1', startsAt: new Date('2025-11-15T14:00:00Z') }),
        event({ id: 'e1', feedId: 'feed-1', startsAt: new Date('2025-11-15T08:00:00Z') }),
        event({ id: 'e3', location: 'Rangitoto Room' }),
      ],
      '2025-11-10',
      '2025-11-16',
    )
    expect(grid.rooms.map((r) => r.id)).toEqual(['feed-1', 'feed-2'])
    expect(grid.cells['feed-1']['2025-11-15'].map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(grid.cells['feed-2']['2025-11-15'].map((e) => e.id)).toEqual(['e3'])
  })

  it('adds the OTHER row only when an event is unmatched', () => {
    const noOther = buildRoomGrid(feeds, [event({ id: 'e1', feedId: 'feed-1' })], '2025-11-10', '2025-11-16')
    expect(noOther.rooms.map((r) => r.id)).toEqual(['feed-1', 'feed-2'])

    const withOther = buildRoomGrid(feeds, [event({ id: 'e9' })], '2025-11-10', '2025-11-16')
    expect(withOther.rooms.map((r) => r.id)).toEqual(['feed-1', 'feed-2', OTHER_ROOM_KEY])
    expect(withOther.cells[OTHER_ROOM_KEY]['2025-11-15'].map((e) => e.id)).toEqual(['e9'])
  })
})
