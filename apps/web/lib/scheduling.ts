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
 * The container runs in UTC, so `date` is treated in the server's local time
 * (== UTC in production), consistent with how `scheduledDate` is stored.
 */
export function isTaskDueOnDate(task: SchedulableTask, date: Date): boolean {
  switch (task.scheduleType) {
    case 'DAILY':
      return true
    case 'WEEKLY':
      return task.scheduleDays.includes(date.getDay())
    case 'CUSTOM': {
      if (!task.customCron?.trim()) return false
      try {
        const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
        const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
        const interval = parser.parseExpression(task.customCron, {
          // start - 1ms so a midnight firing on this date still counts
          currentDate: new Date(start.getTime() - 1),
          endDate: end,
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
