// Event-roster grid logic — pure, Prisma-free. Groups imported CalendarEvents
// into room rows (one per CalendarFeed) across the week, with an "OTHER
// EVENTS" row for events that belong to no room (manual BEO pushes, legacy
// imports).

import { dateKeysBetween } from '@/lib/calendar'

export const OTHER_ROOM_KEY = '__other__'

export interface RosterRoom {
  id: string
  name: string
  colour: string | null
  floorPlanSlug: string | null
}

export interface RosterFeedLike {
  id: string
  name: string
  colour: string | null
  floorPlanSlug: string | null
}

export interface RosterEventLike {
  id: string
  feedId: string | null
  location: string | null
  floorPlanSlug: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  title: string
}

/** UTC wall-clock HH:mm for an imported event start. */
export function formatEventTime(event: { startsAt: Date; allDay: boolean }): string {
  if (event.allDay) return 'ALL DAY'
  const h = String(event.startsAt.getUTCHours()).padStart(2, '0')
  const m = String(event.startsAt.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Which room an event belongs to: its feed, else the feed whose name matches
 * the event's LOCATION, else the feed whose floor plan the event points at,
 * else the shared "other" row.
 */
export function roomKeyForEvent(
  event: Pick<RosterEventLike, 'feedId' | 'location' | 'floorPlanSlug'>,
  feeds: RosterFeedLike[],
): string {
  if (event.feedId) {
    const byId = feeds.find((f) => f.id === event.feedId)
    if (byId) return byId.id
  }
  const loc = event.location?.trim().toUpperCase()
  if (loc) {
    const byName = feeds.find((f) => f.name.trim().toUpperCase() === loc)
    if (byName) return byName.id
  }
  if (event.floorPlanSlug) {
    const byPlan = feeds.find((f) => f.floorPlanSlug === event.floorPlanSlug)
    if (byPlan) return byPlan.id
  }
  return OTHER_ROOM_KEY
}

/**
 * Inclusive day keys an event occupies within [startKey, endKey].
 * All-day DTEND is exclusive, so it is pulled back one day (same rule the
 * admin calendar's merge uses).
 */
export function eventDayKeysInRange(
  event: Pick<RosterEventLike, 'startsAt' | 'endsAt' | 'allDay'>,
  startKey: string,
  endKey: string,
): string[] {
  const start = event.startsAt
  let end = event.endsAt ?? event.startsAt
  if (event.allDay && end.getTime() > start.getTime()) {
    end = new Date(end.getTime() - 86_400_000)
  }
  return dateKeysBetween(start, end).filter((k) => k >= startKey && k <= endKey)
}

export interface RoomGrid<T> {
  rooms: RosterRoom[]
  /** roomKey -> dayKey -> events (sorted by start time, then title). */
  cells: Record<string, Record<string, T[]>>
}

/** Top-level grid builder: feeds become rows; unmatched events go to "other". */
export function buildRoomGrid<T extends RosterEventLike>(
  feeds: RosterFeedLike[],
  events: T[],
  startKey: string,
  endKey: string,
): RoomGrid<T> {
  const rooms: RosterRoom[] = feeds.map((f) => ({
    id: f.id,
    name: f.name,
    colour: f.colour,
    floorPlanSlug: f.floorPlanSlug,
  }))

  const cells: Record<string, Record<string, T[]>> = {}
  const ensure = (roomKey: string, dayKey: string) => {
    cells[roomKey] ??= {}
    cells[roomKey][dayKey] ??= []
    return cells[roomKey][dayKey]
  }

  let otherUsed = false
  for (const event of events) {
    const roomKey = roomKeyForEvent(event, feeds)
    if (roomKey === OTHER_ROOM_KEY) otherUsed = true
    for (const dayKey of eventDayKeysInRange(event, startKey, endKey)) {
      ensure(roomKey, dayKey).push(event)
    }
  }

  const sortCell = (list: T[]) =>
    list.sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title),
    )
  for (const room of Object.values(cells)) {
    for (const list of Object.values(room)) sortCell(list)
  }

  if (otherUsed) {
    rooms.push({ id: OTHER_ROOM_KEY, name: 'OTHER EVENTS', colour: null, floorPlanSlug: null })
  }

  return { rooms, cells }
}
