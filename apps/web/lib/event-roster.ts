// Event overlay helpers — pure, Prisma-free. Resolves which Area an event
// belongs to (its own areaId, else a name match on the event's LOCATION, else
// the area whose floor plan the event points at) and buckets events per day
// for the roster's day-header event chips.

import { dateKeysBetween } from '@/lib/calendar'

export interface RosterAreaLike {
  id: string
  name: string
  colour: string | null
  floorPlanSlug: string | null
}

export interface RosterEventLike {
  id: string
  areaId: string | null
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
 * The area an event belongs to: its explicit areaId, else the area whose name
 * matches the event's LOCATION, else the area whose floor plan the event points
 * at, else null (rendered as "OTHER" by the caller).
 */
export function resolveAreaForEvent(
  event: Pick<RosterEventLike, 'areaId' | 'location' | 'floorPlanSlug'>,
  areas: RosterAreaLike[],
): RosterAreaLike | null {
  if (event.areaId) {
    const byId = areas.find((a) => a.id === event.areaId)
    if (byId) return byId
  }
  const loc = event.location?.trim().toUpperCase()
  if (loc) {
    const byName = areas.find((a) => a.name.trim().toUpperCase() === loc)
    if (byName) return byName
  }
  if (event.floorPlanSlug) {
    const byPlan = areas.find((a) => a.floorPlanSlug === event.floorPlanSlug)
    if (byPlan) return byPlan
  }
  return null
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

export interface DayEvent<T> {
  event: T
  area: RosterAreaLike | null
}

/**
 * Bucket events by day key with their resolved area, each day sorted by start
 * time then title. Out-of-range days are dropped.
 */
export function eventsByDay<T extends RosterEventLike>(
  events: T[],
  areas: RosterAreaLike[],
  startKey: string,
  endKey: string,
): Record<string, DayEvent<T>[]> {
  const cells: Record<string, DayEvent<T>[]> = {}
  for (const event of events) {
    const area = resolveAreaForEvent(event, areas)
    for (const dayKey of eventDayKeysInRange(event, startKey, endKey)) {
      ;(cells[dayKey] ??= []).push({ event, area })
    }
  }
  for (const list of Object.values(cells)) {
    list.sort(
      (a, b) =>
        a.event.startsAt.getTime() - b.event.startsAt.getTime() ||
        a.event.title.localeCompare(b.event.title),
    )
  }
  return cells
}
