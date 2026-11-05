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
 * A list is open when it was force-activated for today, OR (when schedule rows
 * exist) any window for today's day-of-week contains `nowHHmm`, OR (legacy) its
 * `appearFromTime` has passed / it has none. `nowHHmm` is venue-local "HH:mm".
 */
export function isChecklistOpen(
  appearFromTime: string | null | undefined,
  activatedOn: Date | string | null | undefined,
  day: Date | string,
  nowHHmm: string,
  schedules?: readonly ChecklistScheduleWindow[] | null,
  dayOfWeek?: number | null,
): boolean {
  if (isActivatedOn(activatedOn, day)) return true
  if (schedules && schedules.length > 0) {
    return isScheduleOpen(schedules, dayOfWeek ?? weekdayOf(day), nowHHmm)
  }
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
): boolean {
  return !isChecklistOpen(appearFromTime, activatedOn, day, nowHHmm, schedules, dayOfWeek)
}

/**
 * Human "next opening" label for a hidden list, e.g. `OPENS THU 06:00`.
 * Returns null when the list is not time-gated. Searches the next 7 days so a
 * list whose only windows are earlier in the day rolls over to the next week.
 */
export function describeNextOpen(args: {
  schedules?: readonly ChecklistScheduleWindow[] | null
  appearFromTime?: string | null
  day: Date | string
  nowHHmm: string
  dayOfWeek?: number | null
}): string | null {
  const dow = args.dayOfWeek ?? weekdayOf(args.day)
  if (args.schedules && args.schedules.length > 0) {
    for (let offset = 0; offset <= 7; offset++) {
      const target = (dow + offset) % 7
      const starts = args.schedules
        .filter((s) => s.dayOfWeek === target)
        .map((s) => s.fromTime)
        .filter((time) => offset > 0 || time > args.nowHHmm)
        .sort()
      if (starts.length > 0) return `OPENS ${DAY_LABELS[target]} ${starts[0]}`
    }
    return null
  }
  if (args.appearFromTime && args.nowHHmm < args.appearFromTime) {
    return `OPENS ${DAY_LABELS[dow]} ${args.appearFromTime}`
  }
  return null
}
