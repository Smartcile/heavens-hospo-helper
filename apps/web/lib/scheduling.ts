import parser from 'cron-parser'

export interface SchedulableTask {
  scheduleType: string
  scheduleDays: number[]
  customCron: string | null
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
