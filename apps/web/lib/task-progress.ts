// Day-aware PARTIAL carry-over. Prisma-free so the worker task route, the
// worker list and the follow-up engine share one rule.
//
// A PARTIAL is "live" while it was reported on the current venue-local day, OR
// its task belongs to a multi-day (side work) list. A null progressDate is a
// legacy row, so it is stale for a normal list — which fixes the reported bug
// (a partial left on a daily list still showing "in progress" the next day)
// immediately on deploy.

import { formatDateKey } from '@/lib/scheduling'

export interface ProgressLike {
  progressDate: Date | string | null | undefined
}

/**
 * Normalise a stored progress date to a `YYYY-MM-DD` day key. Accepts a Prisma
 * `Date` (from `@db.Date`, anchored at UTC midnight) or an ISO string.
 */
export function progressDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length >= 10 ? trimmed.slice(0, 10) : null
  }
  return formatDateKey(value)
}

/**
 * Live when the partial was reported today, or the task is multi-day (side
 * work keeps going until a terminal outcome).
 */
export function isProgressLive(
  value: Date | string | null | undefined,
  todayKey: string,
  opts: { multiDay?: boolean } = {},
): boolean {
  if (opts.multiDay) return true
  return progressDayKey(value) === todayKey
}

/**
 * Stale = a today-only partial that is not from today. Multi-day rows are never
 * stale. Used by the route's best-effort sweep.
 */
export function isStaleProgress(
  value: Date | string | null | undefined,
  todayKey: string,
  opts: { multiDay?: boolean } = {},
): boolean {
  if (opts.multiDay) return false
  return progressDayKey(value) !== todayKey
}

/**
 * Should a task stay on the floor today? Due today, or carrying a live PARTIAL.
 */
export function carryTaskToday(args: {
  isDueToday: boolean
  progress: ProgressLike | null | undefined
  todayKey: string
  multiDay: boolean
}): boolean {
  if (args.isDueToday) return true
  if (!args.progress) return false
  return isProgressLive(args.progress.progressDate, args.todayKey, { multiDay: args.multiDay })
}
