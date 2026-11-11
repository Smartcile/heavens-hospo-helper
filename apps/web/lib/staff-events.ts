// Staff attendance events — pure rules shared by the admin/worker routes, the
// worker notice card and the calendar views. Prisma-free: dates and response
// windows, invitee resolution, attendance counts and .ics generation live here.

import { isValidTime } from '@/lib/calendar'

export type StaffEventResponseValue = 'ACCEPTED' | 'DECLINED' | 'MAYBE'
export type AttendanceStatus = 'PENDING' | StaffEventResponseValue
export type AudienceKindValue = 'DEPARTMENT' | 'SECTION' | 'POSITION'

export interface StaffEventAudienceRef {
  kind: AudienceKindValue
  targetId: string
}

export interface StaffEventWindow {
  status?: string | null
  startsAt: Date
  endsAt?: Date | null
  responseDeadline?: Date | null
  allowMaybe?: boolean
  requireDeclineReason?: boolean
}

export interface StaffEventFields {
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
  attendanceRequired: boolean
  allowMaybe: boolean
  requireDeclineReason: boolean
  responseDeadline: Date | null
  notes: string | null
}

export interface StaffEventInput {
  title?: unknown
  description?: unknown
  location?: unknown
  notes?: unknown
  date?: unknown
  startTime?: unknown
  endTime?: unknown
  allDay?: unknown
  attendanceRequired?: unknown
  allowMaybe?: unknown
  requireDeclineReason?: unknown
  responseDeadlineDate?: unknown
  responseDeadlineTime?: unknown
}

export type StaffEventFieldsResult =
  | { ok: true; value: StaffEventFields }
  | { ok: false; error: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function validDate(value: string): boolean {
  return DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

/**
 * Build the persisted fields from the admin form / import preview. Times are
 * venue-local wall-clock strings stored as UTC (the same convention imported
 * iCal events, manual calendar events and the roster use).
 */
export function buildStaffEventFields(input: StaffEventInput): StaffEventFieldsResult {
  const title = trim(input.title).toUpperCase()
  if (!title) return { ok: false, error: 'TITLE IS REQUIRED' }

  const date = trim(input.date)
  if (!validDate(date)) return { ok: false, error: 'A VALID DATE IS REQUIRED' }

  const allDay = !!input.allDay
  const startsAt = new Date(`${date}T${allDay ? '00:00' : trim(input.startTime)}:00Z`)
  let endsAt: Date | null = null

  if (allDay) {
    endsAt = new Date(`${date}T23:59:00Z`)
  } else {
    if (!isValidTime(trim(input.startTime))) {
      return { ok: false, error: 'A VALID START TIME IS REQUIRED' }
    }
    const endTime = trim(input.endTime)
    if (!isValidTime(endTime)) return { ok: false, error: 'A VALID END TIME IS REQUIRED' }
    endsAt = new Date(`${date}T${endTime}:00Z`)
    // An end at or before the start rolls to the next day (overnight event).
    if (endsAt.getTime() <= startsAt.getTime()) endsAt = new Date(endsAt.getTime() + 86_400_000)
  }

  let responseDeadline: Date | null = null
  const deadlineDate = trim(input.responseDeadlineDate)
  if (deadlineDate) {
    if (!validDate(deadlineDate)) return { ok: false, error: 'THE RESPONSE DEADLINE DATE IS INVALID' }
    const deadlineTime = trim(input.responseDeadlineTime) || '23:59'
    if (!isValidTime(deadlineTime)) return { ok: false, error: 'THE RESPONSE DEADLINE TIME IS INVALID' }
    responseDeadline = new Date(`${deadlineDate}T${deadlineTime}:00Z`)
  }

  return {
    ok: true,
    value: {
      title,
      description: trim(input.description) || null,
      location: trim(input.location) || null,
      startsAt,
      endsAt,
      allDay,
      attendanceRequired: !!input.attendanceRequired,
      allowMaybe: !!input.allowMaybe,
      requireDeclineReason: !!input.requireDeclineReason,
      responseDeadline,
      notes: trim(input.notes) || null,
    },
  }
}

/** Accept / Decline always; Maybe only when the event allows it. */
export function allowedResponses(allowMaybe: boolean | null | undefined): StaffEventResponseValue[] {
  return allowMaybe ? ['ACCEPTED', 'DECLINED', 'MAYBE'] : ['ACCEPTED', 'DECLINED']
}

/** The last moment a response is accepted: the deadline, else the event end. */
export function responseDeadlineAt(event: StaffEventWindow): Date {
  return event.responseDeadline ?? event.endsAt ?? event.startsAt
}

/**
 * "Now" expressed as the venue's wall clock, stored the same way staff-event
 * dates are (UTC fields = local wall clock). Comparing a stored 20:00 deadline
 * to a real UTC `new Date()` would keep a NZ response window open 13 hours too
 * long. Falls back to the real instant if the timezone is unusable.
 */
export function wallClockNow(now: Date, timezone?: string | null): Date {
  if (!timezone) return now
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value
    const year = Number(get('year'))
    const month = Number(get('month'))
    const day = Number(get('day'))
    const hour = Number(get('hour')) % 24
    const minute = Number(get('minute'))
    const second = Number(get('second'))
    if ([year, month, day, hour, minute, second].some((v) => !Number.isFinite(v))) return now
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  } catch {
    return now
  }
}

export function isResponseOpen(event: StaffEventWindow, now: Date): boolean {
  return event.status === 'PUBLISHED' && now.getTime() <= responseDeadlineAt(event).getTime()
}

/** True once the event itself is over (used to retire the notice). */
export function isStaffEventOver(event: { startsAt: Date; endsAt?: Date | null }, now: Date): boolean {
  return now.getTime() > (event.endsAt ?? event.startsAt).getTime()
}

export type ResponseValidation =
  | { ok: true; response: StaffEventResponseValue; reason: string | null }
  | { ok: false; error: string }

/** Validate a worker RSVP server-side (status, allowed options, window, reason). */
export function validateStaffEventResponse(
  event: StaffEventWindow,
  input: { response?: unknown; reason?: unknown },
  now: Date,
): ResponseValidation {
  if (event.status !== 'PUBLISHED') return { ok: false, error: 'THIS EVENT IS NOT OPEN' }

  const response = trim(input.response).toUpperCase()
  if (!allowedResponses(event.allowMaybe).includes(response as StaffEventResponseValue)) {
    return { ok: false, error: response === 'MAYBE' ? 'MAYBE IS NOT AN OPTION FOR THIS EVENT' : 'CHOOSE ACCEPT, DECLINE OR MAYBE' }
  }

  if (!isResponseOpen(event, now)) return { ok: false, error: 'THE RESPONSE DEADLINE HAS PASSED' }

  const reason = trim(input.reason)
  if (response === 'DECLINED' && event.requireDeclineReason && !reason) {
    return { ok: false, error: 'A REASON IS REQUIRED TO DECLINE' }
  }

  return {
    ok: true,
    response: response as StaffEventResponseValue,
    reason: reason || null,
  }
}

export interface AttendanceCounts {
  pending: number
  accepted: number
  declined: number
  maybe: number
  total: number
  responded: number
}

export function attendanceFor(invites: readonly { response: string }[]): AttendanceCounts {
  const counts: AttendanceCounts = {
    pending: 0,
    accepted: 0,
    declined: 0,
    maybe: 0,
    total: invites.length,
    responded: 0,
  }
  for (const invite of invites) {
    switch (invite.response) {
      case 'ACCEPTED':
        counts.accepted++
        break
      case 'DECLINED':
        counts.declined++
        break
      case 'MAYBE':
        counts.maybe++
        break
      default:
        counts.pending++
        break
    }
  }
  counts.responded = counts.total - counts.pending
  return counts
}

export interface AudienceStaffMember {
  id: string
  departmentId: string | null
  sectionIds: ReadonlySet<string>
  positionIds: ReadonlySet<string>
}

/**
 * The people a published staff event reaches: everyone matching any audience,
 * unioned with explicitly named staff. No audiences and no explicit ids means
 * the whole venue. Unknown explicit ids are ignored (the route validates them).
 */
export function resolveStaffEventTargets(
  staff: readonly AudienceStaffMember[],
  audiences: readonly StaffEventAudienceRef[],
  explicitStaffIds: readonly string[] = [],
): string[] {
  const explicit = new Set(explicitStaffIds)
  const targets = new Set<string>()
  const wholeVenue = audiences.length === 0 && explicit.size === 0

  for (const person of staff) {
    const audienceMatch =
      audiences.some((a) => a.kind === 'DEPARTMENT' && person.departmentId === a.targetId) ||
      audiences.some((a) => a.kind === 'SECTION' && person.sectionIds.has(a.targetId)) ||
      audiences.some((a) => a.kind === 'POSITION' && person.positionIds.has(a.targetId))
    if (wholeVenue || audienceMatch || explicit.has(person.id)) targets.add(person.id)
  }

  return [...targets].sort()
}

/** Escape a value for an iCalendar text property (RFC 5545 §3.3.11). */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/**
 * iCalendar timestamps are VENUE-LOCAL floating times (no Z). Staff-event dates
 * are stored as wall clock in UTC fields, the same convention the roster and
 * imported events use, so emitting a Z suffix would shift the event on a
 * phone in another timezone.
 */
export function formatIcsLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
}

export function formatIcsDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
}

/** Fold a content line at 75 octets (RFC 5545 §3.1). */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let rest = line
  chunks.push(rest.slice(0, 75))
  rest = rest.slice(75)
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest.length) chunks.push(` ${rest}`)
  return chunks.join('\r\n')
}

export interface StaffEventIcsOptions {
  uid: string
  title: string
  description?: string | null
  location?: string | null
  startsAt: Date
  endsAt?: Date | null
  allDay?: boolean
  organiserName?: string | null
  reminderMinutes?: number | null
  now?: Date
}

/**
 * A single-event .ics a phone can open directly. All-day events use DATE
 * values with an exclusive DTEND (the following day).
 */
export function buildStaffEventIcs(options: StaffEventIcsOptions): string {
  const now = options.now ?? new Date()
  const end = options.endsAt ?? new Date(options.startsAt.getTime() + 60 * 60 * 1000)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HOSPO OPS//Staff Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(options.uid)}`,
    `DTSTAMP:${formatIcsLocal(now)}`,
  ]

  if (options.allDay) {
    const exclusiveEnd = new Date(Date.UTC(options.startsAt.getUTCFullYear(), options.startsAt.getUTCMonth(), options.startsAt.getUTCDate() + 1))
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(options.startsAt)}`)
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(exclusiveEnd)}`)
  } else {
    lines.push(`DTSTART:${formatIcsLocal(options.startsAt)}`)
    lines.push(`DTEND:${formatIcsLocal(end)}`)
  }

  lines.push(`SUMMARY:${escapeIcsText(options.title)}`)
  if (options.description) lines.push(`DESCRIPTION:${escapeIcsText(options.description)}`)
  if (options.location) lines.push(`LOCATION:${escapeIcsText(options.location)}`)
  const organiser = options.organiserName?.trim() || 'HOSPO OPS'
  lines.push(`ORGANIZER;CN=${escapeIcsText(organiser)}:mailto:noreply@hospo.local`)
  lines.push('STATUS:CONFIRMED')

  if (options.reminderMinutes && options.reminderMinutes > 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(options.title)}`,
      `TRIGGER:-PT${Math.round(options.reminderMinutes)}M`,
      'END:VALARM',
    )
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(foldIcsLine).join('\r\n') + '\r\n'
}
