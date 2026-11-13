// Client-safe availability-comment types/limits (Prisma-free). The DB half is
// `availability-comments.server.ts`; the idempotent backfill planner lives with
// the migration script in packages/db.
export type AvailabilityCommentSource = 'WORKER_APP' | 'MANAGER' | 'SYSTEM'

export const AVAILABILITY_COMMENT_MAX_LENGTH = 500

/**
 * True only for a real "YYYY-MM-DD" calendar day — the regex shape alone would
 * accept impossible dates like 2026-99-99.
 */
export function isAvailabilityDateKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}
