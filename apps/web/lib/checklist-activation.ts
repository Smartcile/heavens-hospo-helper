// A checklist can carry an `appearFromTime` ("HH:mm", venue-local) so a list
// only shows on the floor once the day has reached that time. An admin can
// force a not-yet-open list open for the rest of the current venue-day by
// stamping `activatedOn`; it resets automatically the next day because the
// stamp is compared against the venue's local calendar day.
//
// Custom schedules (`ChecklistSchedule` rows) replace the legacy every-day time
// gate: a row is a window on one day-of-week (`fromTime`–`toTime`, `toTime` null
// = end of day). Multiple rows per day are allowed. When no rows exist the
// legacy `appearFromTime` behaviour is kept exactly as it was.
//
// Event activation (`ChecklistEvent` links) opens a list across a linked
// CalendarEvent's date/window. CalendarEvent times are stored as venue-local
// wall-clock (UTC parts), the same convention `event-roster` and
// `manual-event` use, so no Intl timezone math is needed here. An event-linked
// list is gated by its events: with no schedule and no `appearFromTime` it is
// closed outside the event window.
//
// Pure and Prisma-free so the worker route, the admin route, the Tasks UI and
// `task-outcomes` all agree on what "open" means. The caller supplies the
// venue-local day + "HH:mm" (and optionally the venue-local day-of-week); no
// helper reads the device clock.

/** The YYYY-MM-DD calendar day of a value (dates are stored anchored to UTC midnight). */
export function dayKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10)
}

/** Venue-local day-of-week of a date value (0 = Sunday .. 6 = Saturday). */
export function weekdayOf(day: Date | string): number {
  if (typeof day === 'string') {
    return new Date(`${day.slice(0, 10)}T00:00:00.000Z`).getUTCDay()
  }
  return new Date(day).getUTCDay()
}

export const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const
export const END_OF_DAY = '23:59'
const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const DAY_MS = 86_400_000

/** The event fields the activation rule reads. */
export interface ChecklistEventWindow {
  id?: string
  title?: string | null
  venueId?: string | null
  startsAt: Date | string
  endsAt?: Date | string | null
  allDay?: boolean | null
  deletedAt?: Date | string | null
  /** CalendarEvent has no cancelled flag; accepted so an Event-style caller can close one. */
  cancelled?: boolean | null
}

/** Read shape shared by the event picker and the list editor. */
export interface CalendarEventSummary {
  id: string
  venueId: string
  title: string
  startsAt: string
  endsAt: string | null
  date: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  /** Set when the event was soft-deleted — the link still gates the list closed. */
  deletedAt: string | null
}

/** A schedule window as the open rule needs it. */
export interface ChecklistScheduleWindow {
  dayOfWeek: number
  fromTime: string
  toTime?: string | null
}

/** A validated schedule row ready to be written. */
export interface CleanChecklistSchedule {
  dayOfWeek: number
  fromTime: string
  toTime: string | null
}

export function isValidHHmm(value: unknown): value is string {
  return typeof value === 'string' && HHMM_PATTERN.test(value)
}

export interface ScheduleValidation {
  ok: boolean
  schedules: CleanChecklistSchedule[]
  error?: string
}

/**
 * Validate a client `schedules` payload. An omitted/undefined value is valid and
 * means "leave the schedule untouched" (the caller decides), an empty array
 * means "remove every schedule row" (fall back to `appearFromTime`).
 */
export function validateSchedules(input: unknown): ScheduleValidation {
  if (input === undefined || input === null) return { ok: true, schedules: [] }
  if (!Array.isArray(input)) return { ok: false, schedules: [], error: 'SCHEDULES MUST BE A LIST' }

  const schedules: CleanChecklistSchedule[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') {
      return { ok: false, schedules: [], error: 'INVALID SCHEDULE ROW' }
    }
    const row = raw as { dayOfWeek?: unknown; fromTime?: unknown; toTime?: unknown }
    if (typeof row.dayOfWeek !== 'number' || !Number.isInteger(row.dayOfWeek) || row.dayOfWeek < 0 || row.dayOfWeek > 6) {
      return { ok: false, schedules: [], error: 'SCHEDULE DAY MUST BE 0–6 (SUN–SAT)' }
    }
    if (!isValidHHmm(row.fromTime)) {
      return { ok: false, schedules: [], error: 'SCHEDULE FROM TIME MUST BE HH:MM' }
    }
    if (row.toTime !== undefined && row.toTime !== null && !isValidHHmm(row.toTime)) {
      return { ok: false, schedules: [], error: 'SCHEDULE TO TIME MUST BE HH:MM' }
    }
    schedules.push({
      dayOfWeek: row.dayOfWeek,
      fromTime: row.fromTime,
      toTime: row.toTime ? row.toTime : null,
    })
  }
  return { ok: true, schedules }
}

/** True when a list was force-activated on the given venue-local day. */
export function isActivatedOn(activatedOn: Date | string | null | undefined, day: Date | string): boolean {
  if (!activatedOn) return false
  return dayKey(activatedOn) === dayKey(day)
}

function hhmmOf(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

/** True when the event is soft-deleted or explicitly cancelled. */
export function isEventClosed(event: Pick<ChecklistEventWindow, 'deletedAt' | 'cancelled'>): boolean {
  return !!event.deletedAt || !!event.cancelled
}

/**
 * The time window an event is open on a given venue-local day, or null when the
 * event does not cover that day. All-day events (or a missing start time) cover
 * whole days; a timed event runs from its start to its end (end of day when it
 * has no end) and middle days of a multi-day event are open all day.
 */
export function eventWindowOnDay(
  event: ChecklistEventWindow,
  day: Date | string,
): { fromTime: string; toTime: string } | null {
  if (isEventClosed(event)) return null

  const start = new Date(event.startsAt)
  if (Number.isNaN(start.getTime())) return null
  let end = event.endsAt ? new Date(event.endsAt) : new Date(start)
  if (Number.isNaN(end.getTime())) end = new Date(start)
  // iCal all-day DTEND is exclusive — pull it back to the last covered day.
  if (event.allDay && end.getTime() > start.getTime()) {
    end = new Date(end.getTime() - DAY_MS)
  }

  const startKey = dayKey(start)
  const endKey = dayKey(end)
  const key = dayKey(day)
  if (key < startKey || key > endKey) return null

  const allDay = !!event.allDay
  const fromTime = key === startKey && !allDay ? hhmmOf(start) : '00:00'
  const toTime = key !== endKey || allDay || !event.endsAt ? END_OF_DAY : hhmmOf(end)
  return { fromTime, toTime }
}

/** True when any linked event is open at the given venue-local day + time. */
export function isEventActive(
  event: ChecklistEventWindow,
  day: Date | string,
  nowHHmm: string,
): boolean {
  const window = eventWindowOnDay(event, day)
  return !!window && nowHHmm >= window.fromTime && nowHHmm <= window.toTime
}

/** True when at least one linked event is open now. */
export function hasActiveEvent(
  events: readonly ChecklistEventWindow[] | null | undefined,
  day: Date | string,
  nowHHmm: string,
): boolean {
  return !!events?.some((event) => isEventActive(event, day, nowHHmm))
}

/** Map a CalendarEvent row to the small shape the picker/editor uses. */
export function summariseCalendarEvent(event: {
  id: string
  venueId: string
  title: string
  startsAt: Date | string
  endsAt?: Date | string | null
  allDay?: boolean | null
  deletedAt?: Date | string | null
}): CalendarEventSummary {
  const start = new Date(event.startsAt)
  const end = event.endsAt ? new Date(event.endsAt) : null
  const allDay = !!event.allDay
  return {
    id: event.id,
    venueId: event.venueId,
    title: event.title,
    startsAt: start.toISOString(),
    endsAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
    date: dayKey(start),
    startTime: allDay ? null : hhmmOf(start),
    endTime: allDay || !end || Number.isNaN(end.getTime()) ? null : hhmmOf(end),
    allDay,
    deletedAt: event.deletedAt ? new Date(event.deletedAt).toISOString() : null,
  }
}

/** True when `nowHHmm` falls inside any window for the given day-of-week. */
export function isScheduleOpen(
  schedules: readonly ChecklistScheduleWindow[] | null | undefined,
  dayOfWeek: number,
  nowHHmm: string,
): boolean {
  if (!schedules?.length) return false
  return schedules.some(
    (s) =>
      s.dayOfWeek === dayOfWeek &&
      nowHHmm >= s.fromTime &&
      nowHHmm <= (s.toTime || END_OF_DAY),
  )
}

/**
 * A list is open when it was force-activated for today, OR a linked calendar
 * event is active now, OR (when schedule rows exist) any window for today's
 * day-of-week contains `nowHHmm`, OR (legacy, only when no schedule or event
 * gate exists) its `appearFromTime` has passed / it has none.
 * `nowHHmm` is venue-local "HH:mm".
 */
export function isChecklistOpen(
  appearFromTime: string | null | undefined,
  activatedOn: Date | string | null | undefined,
  day: Date | string,
  nowHHmm: string,
  schedules?: readonly ChecklistScheduleWindow[] | null,
  dayOfWeek?: number | null,
  events?: readonly ChecklistEventWindow[] | null,
): boolean {
  if (isActivatedOn(activatedOn, day)) return true
  if (hasActiveEvent(events, day, nowHHmm)) return true
  if (schedules && schedules.length > 0) {
    return isScheduleOpen(schedules, dayOfWeek ?? weekdayOf(day), nowHHmm)
  }
  // Linked events are a gate: without an active event the list is closed.
  if (events && events.length > 0) return false
  return !appearFromTime || nowHHmm >= appearFromTime
}

/** True when a list is gated to a later time and is not open yet. */
export function isChecklistHidden(
  appearFromTime: string | null | undefined,
  activatedOn: Date | string | null | undefined,
  day: Date | string,
  nowHHmm: string,
  schedules?: readonly ChecklistScheduleWindow[] | null,
  dayOfWeek?: number | null,
  events?: readonly ChecklistEventWindow[] | null,
): boolean {
  return !isChecklistOpen(appearFromTime, activatedOn, day, nowHHmm, schedules, dayOfWeek, events)
}

interface NextOpenCandidate {
  offset: number
  time: string
  label: string
}

function nextEventCandidate(
  event: ChecklistEventWindow,
  day: Date | string,
  nowHHmm: string,
): NextOpenCandidate | null {
  if (isEventClosed(event)) return null
  const start = new Date(event.startsAt)
  if (Number.isNaN(start.getTime())) return null

  const currentKey = dayKey(day)
  const startKey = dayKey(start)
  const offset = Math.round(
    (Date.parse(`${startKey}T00:00:00.000Z`) - Date.parse(`${currentKey}T00:00:00.000Z`)) / DAY_MS,
  )
  // An event that already started is either active now or over — it has no
  // future opening for this list.
  if (offset < 0) return null
  const allDay = !!event.allDay
  if (offset === 0 && allDay) return null
  const time = allDay ? '00:00' : hhmmOf(start)
  if (offset === 0 && time <= nowHHmm) return null

  const dow = weekdayOf(start)
  const title = event.title?.trim().toUpperCase()
  return {
    offset,
    time,
    label: `OPENS ${DAY_LABELS[dow]} ${time}${title ? ` · ${title}` : ''}`,
  }
}

/**
 * Human "next opening" label for a hidden list, e.g. `OPENS THU 06:00` or
 * `OPENS FRI 18:00 · DINNER`. Returns null when the list has no future opening.
 * Schedule windows and linked calendar events are both considered; the nearest
 * wins. The legacy appear-from time is only used when there is no schedule or
 * event gate.
 */
export function describeNextOpen(args: {
  schedules?: readonly ChecklistScheduleWindow[] | null
  appearFromTime?: string | null
  events?: readonly ChecklistEventWindow[] | null
  day: Date | string
  nowHHmm: string
  dayOfWeek?: number | null
}): string | null {
  const dow = args.dayOfWeek ?? weekdayOf(args.day)
  const hasEvents = !!args.events && args.events.length > 0
  const candidates: NextOpenCandidate[] = []

  if (args.schedules && args.schedules.length > 0) {
    for (let offset = 0; offset <= 7; offset++) {
      const target = (dow + offset) % 7
      const starts = args.schedules
        .filter((s) => s.dayOfWeek === target)
        .map((s) => s.fromTime)
        .filter((time) => offset > 0 || time > args.nowHHmm)
        .sort()
      if (starts.length > 0) {
        candidates.push({ offset, time: starts[0], label: `OPENS ${DAY_LABELS[target]} ${starts[0]}` })
        break
      }
    }
  } else if (!hasEvents && args.appearFromTime && args.nowHHmm < args.appearFromTime) {
    candidates.push({
      offset: 0,
      time: args.appearFromTime,
      label: `OPENS ${DAY_LABELS[dow]} ${args.appearFromTime}`,
    })
  }

  for (const event of args.events ?? []) {
    const candidate = nextEventCandidate(event, args.day, args.nowHHmm)
    if (candidate) candidates.push(candidate)
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.offset - b.offset || a.time.localeCompare(b.time))
  return candidates[0].label
}
