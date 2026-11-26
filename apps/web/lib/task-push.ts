// FINISH TOMORROW (#143) — the pure rule. Prisma-free so the worker list, the
// completion modal and the push route share one definition.
//
// A push is NOT a completion. It records a TaskPush audit row and stamps the
// shared TaskProgress with `pushedToDate`, so the task leaves today's floor and
// returns on its day. No TaskCompletion / FollowUp / report / section-review
// row is written, so retraining and reporting paths cannot fire.
//
// Repeating a push on the same task forms a streak (each push's `toDate` is the
// next push's `fromDate`). When the streak reaches the list's threshold the
// first push of that streak raises one pinned manager Notice.

import {
  isChecklistOpen,
  weekdayOf,
  type ChecklistEventWindow,
  type ChecklistScheduleWindow,
} from '@/lib/checklist-activation'
import { isPushedToFuture, progressDayKey } from '@/lib/task-progress'

export const DEFAULT_PUSH_ALERT_AFTER = 3

export interface PushDayLike {
  fromDate: Date | string | null | undefined
  toDate: Date | string | null | undefined
  alertedAt?: Date | string | null
}

export interface PushListLike {
  name: string
  appearFromTime?: string | null
  activatedOn?: Date | string | null
  schedules?: readonly ChecklistScheduleWindow[] | null
  events?: readonly ChecklistEventWindow[] | null
  allowPushToTomorrow?: boolean | null
  pushAlertAfter?: number | null
}

/**
 * The venue-local day after `todayKey` (YYYY-MM-DD). Day keys are UTC-anchored
 * calendar days (see lib/scheduling), so this stays free of timezone maths.
 */
export function tomorrowKey(todayKey: string): string {
  const d = new Date(`${todayKey}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * The first list that is open right now — the same rule
 * `resolveOutcomePolicyForChecklists` uses (earliest appear-from, then name).
 */
export function openPushList(
  lists: readonly PushListLike[],
  ctx: { today: Date | string; nowHHmm: string },
): PushListLike | null {
  if (lists.length === 0) return null
  const dayOfWeek = weekdayOf(ctx.today)
  const sorted = [...lists].sort(
    (a, b) =>
      (a.appearFromTime ?? '').localeCompare(b.appearFromTime ?? '') ||
      a.name.localeCompare(b.name),
  )
  return (
    sorted.find((c) =>
      isChecklistOpen(
        c.appearFromTime ?? null,
        c.activatedOn ?? null,
        ctx.today,
        ctx.nowHHmm,
        c.schedules,
        dayOfWeek,
        c.events,
      ),
    ) ?? null
  )
}

/** FINISH TOMORROW is offered only for a task in an open list that allows it. */
export function isPushAllowed(list: PushListLike | null | undefined): boolean {
  return !!list?.allowPushToTomorrow
}

/** Alert threshold: a positive whole number of pushes, default 3. */
export function normalisePushAlertAfter(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PUSH_ALERT_AFTER
  return Math.min(50, Math.round(n))
}

/**
 * Consecutive pushes, newest first. Each row's `toDate` must be the next
 * (older) row's `fromDate`; anything else ends the streak. `alertedAt` on any
 * row of the streak means this streak has already alerted.
 */
function streakRows(
  pushes: readonly PushDayLike[],
): { from: string; to: string; alerted: boolean }[] {
  const rows = pushes
    .map((p) => ({
      from: progressDayKey(p.fromDate),
      to: progressDayKey(p.toDate),
      alerted: !!p.alertedAt,
    }))
    .filter((p): p is { from: string; to: string; alerted: boolean } => !!p.from && !!p.to)
    .sort((a, b) => b.from.localeCompare(a.from))

  if (rows.length === 0) return []
  const streak = [rows[0]]
  let current = rows[0]
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].to !== current.from) break
    streak.push(rows[i])
    current = rows[i]
  }
  return streak
}

/** How many consecutive pushes the task is on (0 = none). */
export function pushStreakCount(pushes: readonly PushDayLike[]): number {
  return streakRows(pushes).length
}

/** True when the current streak already raised its manager alert. */
export function streakAlerted(pushes: readonly PushDayLike[]): boolean {
  return streakRows(pushes).some((r) => r.alerted)
}

/**
 * Fire the alert when the streak reaches the threshold, once per streak. A
 * later streak (the task was worked again, then pushed afresh) alerts again.
 */
export function shouldAlert(
  streak: number,
  threshold: number | null | undefined,
  opts: { alreadyAlerted?: boolean } = {},
): boolean {
  if (streak < normalisePushAlertAfter(threshold)) return false
  return !opts.alreadyAlerted
}

/** A push whose day has not arrived keeps the task off today's floor. */
export function isHiddenToday(
  pushedToDate: Date | string | null | undefined,
  todayKey: string,
): boolean {
  return isPushedToFuture(pushedToDate, todayKey)
}
