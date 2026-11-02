// Pure date-navigation helpers for the DateNav selector. All keys are
// "YYYY-MM-DD" strings interpreted in UTC so day arithmetic never shifts
// across timezones.

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]
const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
export const MONTH_ABBR = MONTH_NAMES.map((n) => n.slice(0, 3))

/**
 * The venue's business day, e.g. 06:00 → 05:59 (next day). Read-only in the
 * DateNav popover; there is no Settings source for this yet, so it lives here
 * until one exists.
 */
export const DEFAULT_BUSINESS_HOURS = { start: '06:00', end: '05:59' }

export interface DateRange {
  start: string
  end: string
}

export function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

export function keyOfDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function shiftDay(key: string, days: number): string {
  const d = parseDay(key)
  d.setUTCDate(d.getUTCDate() + days)
  return keyOfDay(d)
}

/** Monday of the week containing key (weeks run Monday–Sunday). */
export function mondayOf(key: string): string {
  const d = parseDay(key)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return keyOfDay(d)
}

/** 1-based month shifted by delta, wrapping year boundaries. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}TH`
  switch (n % 10) {
    case 1: return `${n}ST`
    case 2: return `${n}ND`
    case 3: return `${n}RD`
    default: return `${n}TH`
  }
}

/** "2026-08-09" → "SUNDAY, 9TH AUGUST 2026" */
export function formatDateLong(key: string): string {
  const d = parseDay(key)
  return `${DAY_NAMES[d.getUTCDay()]}, ${ordinal(d.getUTCDate())} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** A multi-day range → "10TH – 16TH AUGUST 2026" (single day → long format). */
export function formatDateRange(range: DateRange): string {
  const s = parseDay(range.start)
  const e = parseDay(range.end)
  if (range.start === range.end) return formatDateLong(range.start)
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear()
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth()
  if (sameMonth) {
    return `${ordinal(s.getUTCDate())} – ${ordinal(e.getUTCDate())} ${MONTH_NAMES[s.getUTCMonth()]} ${s.getUTCFullYear()}`
  }
  if (sameYear) {
    return `${ordinal(s.getUTCDate())} ${MONTH_NAMES[s.getUTCMonth()]} – ${ordinal(e.getUTCDate())} ${MONTH_NAMES[e.getUTCMonth()]} ${e.getUTCFullYear()}`
  }
  return `${ordinal(s.getUTCDate())} ${MONTH_NAMES[s.getUTCMonth()]} ${s.getUTCFullYear()} – ${ordinal(e.getUTCDate())} ${MONTH_NAMES[e.getUTCMonth()]} ${e.getUTCFullYear()}`
}

/** "2026-08-09" → "AUG 9, 2026" */
export function formatDateShort(key: string): string {
  const d = parseDay(key)
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** First day of the month containing key. */
export function firstOfMonthKey(key: string): string {
  const d = parseDay(key)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** Last day of the month containing key. */
export function endOfMonthKey(key: string): string {
  const d = parseDay(key)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

export interface DayCell {
  key: string
  day: number
  inMonth: boolean
}

/** Monday-first calendar grid for a 1-based month, padded to full weeks. */
export function monthGrid(year: number, month: number): DayCell[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const lead = (firstWeekday + 6) % 7
  const cells: DayCell[] = []
  for (let i = 0; i < lead; i++) cells.push({ key: '', day: 0, inMonth: false })
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: keyOfDay(new Date(Date.UTC(year, month - 1, d))), day: d, inMonth: true })
  }
  while (cells.length % 7 !== 0) cells.push({ key: '', day: 0, inMonth: false })
  return cells
}

/** All 7 keys of the Monday–Sunday week containing key. */
export function weekKeys(key: string): string[] {
  const monday = parseDay(mondayOf(key))
  return Array.from({ length: 7 }, (_, i) => keyOfDay(new Date(monday.getTime() + i * 86400000)))
}
