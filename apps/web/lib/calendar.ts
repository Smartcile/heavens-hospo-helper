import { formatDateKey } from '@/lib/scheduling'

export { formatDateKey }

/** All UTC-anchored day Dates in a given month, plus its first/last day. */
export function monthDays(year: number, month: number): { first: Date; last: Date; days: Date[] } {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days: Date[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(Date.UTC(year, month - 1, d)))
  }
  return {
    first: new Date(Date.UTC(year, month - 1, 1)),
    last: new Date(Date.UTC(year, month - 1, daysInMonth)),
    days,
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && HHMM.test(value)
}

/** Inclusive list of UTC-anchored day keys between two @db.Date values. */
export function dateKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (cur.getTime() <= stop.getTime()) {
    keys.push(formatDateKey(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return keys
}
