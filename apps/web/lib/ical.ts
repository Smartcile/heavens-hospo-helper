// Minimal RFC 5545 (iCalendar / .ics) reader — no external dependency, so the
// Docker build stays lean. Parses VEVENTs into a flat list, expanding simple
// recurring events (RRULE) within a bounded window. Times are parsed into a UTC
// instant whose UTC wall-clock matches the feed's wall-clock, so day-grid
// grouping and HH:mm display use getUTC* consistently (the app is a day-level
// "what's on" board, not a tz-exact scheduler).

import type { CalendarSource } from '@hospo-ops/db'

export interface ParsedEvent {
  uid: string
  title: string
  description: string | null
  location: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
}

export interface CalendarFeed {
  source: CalendarSource
  url: string
}

// How far around "today" we expand recurring events.
const WINDOW_BACK_DAYS = 60
const WINDOW_FWD_DAYS = 400
const MAX_OCCURRENCES = 500

interface VenueFeedConfig {
  googleCalendarUrl?: string | null
  icalFeedUrl?: string | null
}

/** Derive the importable iCal feed URLs for a venue. */
export function feedsForVenue(venue: VenueFeedConfig): CalendarFeed[] {
  const feeds: CalendarFeed[] = []

  const google = (venue.googleCalendarUrl ?? '').trim()
  if (google) {
    for (const url of googleEmbedToIcal(google)) feeds.push({ source: 'GOOGLE', url })
  }

  const ical = (venue.icalFeedUrl ?? '').trim()
  if (ical) {
    // webcal:// is just an iCal subscribe scheme — fetch over https.
    feeds.push({ source: 'ICAL', url: ical.replace(/^webcal:\/\//i, 'https://') })
  }

  return feeds
}

/**
 * Turn a Google Calendar link into one or more public iCal feed URLs.
 * - An embed link (…/embed?src=ID&src=ID2) → one feed per `src` calendar id.
 * - An already-iCal link (…/ical/…/basic.ics) → used as-is.
 */
export function googleEmbedToIcal(link: string): string[] {
  if (/\/ical\/.*\.ics/i.test(link)) return [link]
  try {
    const u = new URL(link)
    const srcs = u.searchParams.getAll('src').filter(Boolean)
    if (srcs.length === 0) return []
    return srcs.map(
      (id) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`,
    )
  } catch {
    return []
  }
}

export async function fetchAndParseIcs(url: string): Promise<ParsedEvent[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'HospoOps/1.0 (+calendar-sync)', Accept: 'text/calendar,*/*' },
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('NOT AN ICAL FEED')
  return parseIcs(text)
}

export function parseIcs(text: string): ParsedEvent[] {
  const lines = unfold(text)
  const events: ParsedEvent[] = []

  let cur: Record<string, { value: string; params: Record<string, string> }> | null = null
  for (const line of lines) {
    const upper = line.toUpperCase()
    if (upper === 'BEGIN:VEVENT') { cur = {}; continue }
    if (upper === 'END:VEVENT') {
      if (cur) events.push(...buildEvents(cur))
      cur = null
      continue
    }
    if (!cur) continue
    const parsed = parseLine(line)
    if (parsed) cur[parsed.name] = { value: parsed.value, params: parsed.params }
  }
  return events
}

// --- internals ---

/** Join RFC 5545 folded lines (continuations begin with a space or tab). */
function unfold(text: string): string[] {
  const raw = text.split(/\r\n|\n|\r/)
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function parseLine(line: string): { name: string; value: string; params: Record<string, string> } | null {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts = left.split(';')
  const name = parts[0].toUpperCase()
  const params: Record<string, string> = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq !== -1) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1)
  }
  return { name, value, params }
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

/** Parse a DTSTART/DTEND value into a UTC instant + all-day flag. */
function parseDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  // All-day: VALUE=DATE → YYYYMMDD
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
    if (!m) return null
    return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), allDay: true }
  }
  // Date-time: YYYYMMDDTHHMMSS(Z)?  — trailing Z = UTC; otherwise treat the
  // wall-clock as UTC components (TZID offsets are not resolved; see file note).
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(value)
  if (!m) return null
  return {
    date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])),
    allDay: false,
  }
}

function buildEvents(
  props: Record<string, { value: string; params: Record<string, string> }>,
): ParsedEvent[] {
  const dtstart = props.DTSTART
  if (!dtstart) return []
  const start = parseDate(dtstart.value, dtstart.params)
  if (!start) return []

  const dtend = props.DTEND ? parseDate(props.DTEND.value, props.DTEND.params) : null
  const baseUid = props.UID?.value?.trim() || `${dtstart.value}-${props.SUMMARY?.value ?? 'EVENT'}`
  const title = (props.SUMMARY ? unescapeText(props.SUMMARY.value) : 'UNTITLED').trim() || 'UNTITLED'
  const description = props.DESCRIPTION ? unescapeText(props.DESCRIPTION.value) : null
  const location = props.LOCATION ? unescapeText(props.LOCATION.value) : null

  const durationMs = dtend ? dtend.date.getTime() - start.date.getTime() : null

  const base = (uid: string, s: Date): ParsedEvent => ({
    uid,
    title,
    description,
    location,
    startsAt: s,
    endsAt: durationMs !== null ? new Date(s.getTime() + durationMs) : null,
    allDay: start.allDay,
  })

  const rrule = props.RRULE?.value
  if (!rrule) return [base(baseUid, start.date)]

  // Recurring: expand within the window. Per-occurrence UID keeps upsert stable.
  const exdates = collectExDates(props)
  const occurrences = expandRecurrence(start.date, rrule, start.allDay)
  return occurrences
    .filter((d) => !exdates.has(dayStamp(d)))
    .slice(0, MAX_OCCURRENCES)
    .map((d) => base(`${baseUid}_${dayStamp(d)}`, d))
}

function collectExDates(
  props: Record<string, { value: string; params: Record<string, string> }>,
): Set<string> {
  const set = new Set<string>()
  const ex = props.EXDATE
  if (!ex) return set
  for (const piece of ex.value.split(',')) {
    const d = parseDate(piece.trim(), ex.params)
    if (d) set.add(dayStamp(d.date))
  }
  return set
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** Expand FREQ=DAILY/WEEKLY/MONTHLY rules (INTERVAL, COUNT, UNTIL, weekly BYDAY). */
function expandRecurrence(start: Date, rrule: string, allDay: boolean): Date[] {
  const rule: Record<string, string> = {}
  for (const part of rrule.split(';')) {
    const eq = part.indexOf('=')
    if (eq !== -1) rule[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase()
  }
  const freq = rule.FREQ
  if (!freq) return [start]

  const interval = Math.max(1, parseInt(rule.INTERVAL ?? '1', 10) || 1)
  const count = rule.COUNT ? parseInt(rule.COUNT, 10) : null
  const until = rule.UNTIL ? parseDate(rule.UNTIL.replace(/Z$/i, 'Z'), {})?.date ?? null : null

  const now = Date.now()
  const windowStart = now - WINDOW_BACK_DAYS * 86400000
  const windowEnd = now + WINDOW_FWD_DAYS * 86400000

  const byDays = (rule.BYDAY ?? '')
    .split(',')
    .map((d) => DAY_CODES.indexOf(d.replace(/^[+-]?\d+/, '')))
    .filter((i) => i >= 0)

  const out: Date[] = []
  let emitted = 0
  // Cursor advances by FREQ*INTERVAL; for weekly+BYDAY we emit each matching day in the week.
  const cursor = new Date(start.getTime())
  let guard = 0

  while (guard++ < 5000) {
    if (until && cursor.getTime() > until.getTime()) break
    if (count && emitted >= count) break
    if (cursor.getTime() > windowEnd) break

    if (freq === 'WEEKLY' && byDays.length > 0) {
      // Walk the 7 days of the cursor's week, emitting matching weekdays.
      const weekStart = new Date(cursor.getTime())
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart.getTime() + i * 86400000)
        if (day.getTime() < start.getTime()) continue
        if (!byDays.includes(day.getUTCDay())) continue
        if (until && day.getTime() > until.getTime()) break
        if (count && emitted >= count) break
        if (day.getTime() >= windowStart && day.getTime() <= windowEnd) out.push(new Date(day.getTime()))
        emitted++
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7 * interval)
      continue
    }

    if (cursor.getTime() >= windowStart) out.push(new Date(cursor.getTime()))
    emitted++

    if (freq === 'DAILY') cursor.setUTCDate(cursor.getUTCDate() + interval)
    else if (freq === 'WEEKLY') cursor.setUTCDate(cursor.getUTCDate() + 7 * interval)
    else if (freq === 'MONTHLY') cursor.setUTCMonth(cursor.getUTCMonth() + interval)
    else if (freq === 'YEARLY') cursor.setUTCFullYear(cursor.getUTCFullYear() + interval)
    else break
  }

  // Always include the seed if it lands in-window and nothing matched it.
  if (out.length === 0 && start.getTime() >= windowStart && start.getTime() <= windowEnd) {
    out.push(start)
  }
  void allDay
  return out
}

function dayStamp(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}
