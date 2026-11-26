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
  /** #143 — the day a FINISH TOMORROW push revives the task. */
  pushedToDate?: Date | string | null
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
 * A push targets a day after today, so the task stays off today's floor. It is
 * NOT stale: the stale sweep must never delete a future push.
 */
export function isPushedToFuture(
  value: Date | string | null | undefined,
  todayKey: string,
): boolean {
  const key = progressDayKey(value)
  return !!key && key > todayKey
}

/**
 * Stale = a today-only partial that is not from today. Multi-day rows and a
 * push that has not reached its day yet are never stale. Used by the route's
 * best-effort sweep.
 */
export function isStaleProgress(
  value: Date | string | null | undefined,
  todayKey: string,
  opts: { multiDay?: boolean; pushedToDate?: Date | string | null } = {},
): boolean {
  if (opts.multiDay) return false
  if (isPushedToFuture(opts.pushedToDate, todayKey)) return false
  return progressDayKey(value) !== todayKey
}

/**
 * Should a task stay on the floor today? Due today, carrying a live PARTIAL, or
 * already completed today (a live completion keeps the task settled even if a
 * later schedule/list edit means it is no longer due). `completedToday` defaults
 * to false so existing callers are unchanged.
 *
 * A FINISH TOMORROW push hides the task until its day even when it is due, and
 * has no effect once that day arrives (#143).
 */
export function carryTaskToday(args: {
  isDueToday: boolean
  progress: ProgressLike | null | undefined
  todayKey: string
  multiDay: boolean
  completedToday?: boolean
}): boolean {
  if (args.progress && isPushedToFuture(args.progress.pushedToDate, args.todayKey)) return false
  if (args.isDueToday) return true
  if (args.completedToday) return true
  if (!args.progress) return false
  return isProgressLive(args.progress.progressDate, args.todayKey, { multiDay: args.multiDay })
}
