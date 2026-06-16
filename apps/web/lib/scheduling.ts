import parser from 'cron-parser'

export interface SchedulableTask {
  scheduleType: string
  scheduleDays: number[]
  customCron: string | null
  intervalMonths?: number | null
  monthlyOption?: string | null
  monthlyDay?: number | null
  createdAt?: Date | string | null
}

const DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** Monthly "when" options, for the task form. */
export const MONTHLY_OPTIONS = [
  { value: 'FIRST_DAY', label: 'START OF MONTH (1ST)' },
  { value: 'LAST_DAY', label: 'END OF MONTH (LAST DAY)' },
  { value: 'FIRST_WEEKDAY', label: 'FIRST WEEKDAY' },
  { value: 'LAST_WEEKDAY', label: 'LAST WEEKDAY' },
  { value: 'FIRST_MONDAY', label: 'FIRST MONDAY' },
  { value: 'LAST_FRIDAY', label: 'LAST FRIDAY' },
  { value: 'FIFTEENTH', label: 'MID-MONTH (15TH)' },
  { value: 'SPECIFIC_DAY', label: 'SPECIFIC DAY…' },
]

const MONTHLY_SHORT: Record<string, string> = {
  FIRST_DAY: 'START OF MONTH', LAST_DAY: 'END OF MONTH', FIFTEENTH: '15TH',
  FIRST_WEEKDAY: 'FIRST WEEKDAY', LAST_WEEKDAY: 'LAST WEEKDAY',
  FIRST_MONDAY: 'FIRST MONDAY', LAST_FRIDAY: 'LAST FRIDAY',
}

/** Does a date match a monthly "when" rule? `date` is UTC-anchored. */
function monthlyDayMatches(option: string, monthlyDay: number, date: Date): boolean {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth()
  const dom = date.getUTCDate()
  const dow = date.getUTCDay()
  const lastDom = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const dow1 = new Date(Date.UTC(y, m, 1)).getUTCDay()
  const firstWeekdayDom = dow1 === 6 ? 3 : dow1 === 0 ? 2 : 1
  const dowLast = new Date(Date.UTC(y, m, lastDom)).getUTCDay()
  const lastWeekdayDom = dowLast === 6 ? lastDom - 1 : dowLast === 0 ? lastDom - 2 : lastDom
  switch (option) {
    case 'FIRST_DAY': return dom === 1
    case 'LAST_DAY': return dom === lastDom
    case 'FIFTEENTH': return dom === 15
    case 'SPECIFIC_DAY': return dom === Math.min(Math.max(monthlyDay || 1, 1), lastDom)
    case 'FIRST_MONDAY': return dow === 1 && dom <= 7
    case 'LAST_FRIDAY': return dow === 5 && dom > lastDom - 7
    case 'FIRST_WEEKDAY': return dom === firstWeekdayDom
    case 'LAST_WEEKDAY': return dom === lastWeekdayDom
    default: return false
  }
}

/** Human label for a task's schedule (e.g. "MON, WED, FRI" or "EVERY 3 MONTHS · END OF MONTH"). */
export function describeSchedule(t: SchedulableTask): string {
  switch (t.scheduleType) {
    case 'DAILY':
      return 'DAILY'
    case 'WEEKLY':
      return t.scheduleDays?.length ? [...t.scheduleDays].sort((a, b) => a - b).map((d) => DOW_SHORT[d]).join(', ') : 'WEEKLY'
    case 'CUSTOM':
      return 'CUSTOM'
    case 'MONTHLY': {
      const base = t.monthlyOption === 'SPECIFIC_DAY'
        ? `DAY ${t.monthlyDay ?? 1}`
        : (MONTHLY_SHORT[t.monthlyOption ?? 'FIRST_DAY'] ?? 'MONTHLY')
      const iv = t.intervalMonths ?? 1
      return iv > 1 ? `EVERY ${iv} MONTHS · ${base}` : base
    }
    default:
      return t.scheduleType
  }
}

/**
 * Whether a task is due on a given calendar date.
 * - DAILY  → always
 * - WEEKLY → the date's day-of-week is in scheduleDays (0=Sun..6=Sat)
 * - CUSTOM → the cron expression has at least one firing on that date
 *
 * `date` is expected to be a UTC-anchored calendar date (as produced by
 * `getTodayDate(timezone)`), so everything here is evaluated in UTC. That makes
 * the result independent of the server's own timezone and consistent with how
 * `scheduledDate` (@db.Date) and `formatDateKey` round-trip dates.
 */
export function isTaskDueOnDate(task: SchedulableTask, date: Date): boolean {
  switch (task.scheduleType) {
    case 'DAILY':
      return true
    case 'WEEKLY':
      return task.scheduleDays.includes(date.getUTCDay())
    case 'MONTHLY': {
      const interval = Math.max(1, task.intervalMonths ?? 1)
      if (interval > 1 && task.createdAt) {
        const anchor = new Date(task.createdAt)
        const monthsSince = (date.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (date.getUTCMonth() - anchor.getUTCMonth())
        if (monthsSince < 0 || monthsSince % interval !== 0) return false
      }
      return monthlyDayMatches(task.monthlyOption ?? 'FIRST_DAY', task.monthlyDay ?? 1, date)
    }
    case 'CUSTOM': {
      if (!task.customCron?.trim()) return false
      try {
        const y = date.getUTCFullYear()
        const m = date.getUTCMonth()
        const d = date.getUTCDate()
        const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0))
        const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999))
        const interval = parser.parseExpression(task.customCron, {
          // start - 1ms so a midnight firing on this date still counts
          currentDate: new Date(start.getTime() - 1),
          endDate: end,
          tz: 'UTC',
        })
        return interval.hasNext()
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

/** Canonical YYYY-MM-DD key matching how Prisma round-trips a @db.Date value. */
export function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
