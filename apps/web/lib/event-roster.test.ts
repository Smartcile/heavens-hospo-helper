import { describe, it, expect } from 'vitest'
import {
  formatEventTime,
  resolveAreaForEvent,
  eventDayKeysInRange,
  eventsByDay,
  type RosterAreaLike,
  type RosterEventLike,
} from '@/lib/event-roster'

const areas: RosterAreaLike[] = [
  { id: 'area-1', name: 'TE KAWAU ROOM', colour: null, floorPlanSlug: 'te-kawau' },
  { id: 'area-2', name: 'RANGITOTO ROOM', colour: null, floorPlanSlug: null },
]

function event(partial: Partial<RosterEventLike> & { id: string }): RosterEventLike {
  return {
    areaId: null,
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

describe('resolveAreaForEvent', () => {
  it('prefers the explicit areaId', () => {
    expect(resolveAreaForEvent({ areaId: 'area-2', location: null, floorPlanSlug: null }, areas)?.id).toBe('area-2')
  })

  it('matches LOCATION against area names', () => {
    expect(resolveAreaForEvent({ areaId: null, location: 'Te Kawau Room', floorPlanSlug: null }, areas)?.id).toBe('area-1')
  })

  it('matches the floor plan slug', () => {
    expect(resolveAreaForEvent({ areaId: null, location: null, floorPlanSlug: 'te-kawau' }, areas)?.id).toBe('area-1')
  })

  it('returns null for unmatched events', () => {
    expect(resolveAreaForEvent({ areaId: 'gone', location: null, floorPlanSlug: null }, areas)).toBeNull()
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

describe('eventsByDay', () => {
  it('buckets by day with resolved areas, sorted by start time', () => {
    const cells = eventsByDay(
      [
        event({ id: 'e2', areaId: 'area-1', startsAt: new Date('2025-11-15T14:00:00Z') }),
        event({ id: 'e1', areaId: 'area-1', startsAt: new Date('2025-11-15T08:00:00Z') }),
        event({ id: 'e3', location: 'Rangitoto Room' }),
      ],
      areas,
      '2025-11-10',
      '2025-11-16',
    )
    expect(cells['2025-11-15'].map((d) => d.event.id)).toEqual(['e1', 'e3', 'e2'])
    expect(cells['2025-11-15'][0].area?.id).toBe('area-1')
    expect(cells['2025-11-15'][1].area?.id).toBe('area-2')
  })

  it('leaves unmatched events with a null area', () => {
    const cells = eventsByDay([event({ id: 'e9' })], areas, '2025-11-10', '2025-11-16')
    expect(cells['2025-11-15']).toHaveLength(1)
    expect(cells['2025-11-15'][0].area).toBeNull()
  })

  it('spreads multi-day events across their days', () => {
    const cells = eventsByDay(
      [event({ id: 'e1', startsAt: new Date('2025-11-14T15:00:00Z'), endsAt: new Date('2025-11-16T10:00:00Z') })],
      areas,
      '2025-11-14',
      '2025-11-16',
    )
    expect(Object.keys(cells).sort()).toEqual(['2025-11-14', '2025-11-15', '2025-11-16'])
  })
})
