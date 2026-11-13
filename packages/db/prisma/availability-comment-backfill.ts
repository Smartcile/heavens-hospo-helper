// Pure helpers for availability comment threads (client-safe: no Prisma).
//
// The comment history lives in AvailabilityComment. The latest body is mirrored
// onto StaffAvailability.notes so the grids and month cells keep a cheap read.
// `legacyRef` is deterministic so the one-off backfill is idempotent — a re-run
// upserts the same ref instead of adding a duplicate.

export type AvailabilityCommentSource = 'WORKER_APP' | 'MANAGER' | 'SYSTEM'

export const AVAILABILITY_COMMENT_MAX_LENGTH = 500

export interface AvailabilityCommentSeed {
  legacyRef: string
  venueId: string
  staffId: string
  seriesId: string | null
  date: string // YYYY-MM-DD
  body: string
  source: AvailabilityCommentSource
  authorId: string | null
  createdAt: Date
}

/** A comment row that already exists (live or soft-deleted). */
export interface ExistingAvailabilityComment {
  legacyRef: string | null
  staffId: string
  date: string // YYYY-MM-DD
  body: string
  deletedAt: Date | null
}

export type AvailabilityCommentBackfillAction =
  | { kind: 'SKIP'; seed: AvailabilityCommentSeed; reason: 'LEGACY_REF_EXISTS' }
  | { kind: 'TOMBSTONE'; seed: AvailabilityCommentSeed }
  | { kind: 'CREATE'; seed: AvailabilityCommentSeed }

function bodyKey(staffId: string, date: string, body: string): string {
  return `${staffId}|${date}|${body.trim()}`
}

export interface StaffAvailabilityNoteSource {
  id: string
  venueId: string
  staffId: string
  date: Date
  seriesId: string | null
  notes: string | null
  reason: string | null
  reviewNote: string | null
  reviewedById: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface EditRequestNoteSource {
  id: string
  venueId: string
  staffId: string
  date: Date
  seriesId: string | null
  reason: string | null
  reviewNote: string | null
  reviewedById: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** "2026-11-12" from a stored @db.Date (UTC midnight). */
export function availabilityDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Convert the old note columns into comment rows with their original
 * authorship and timestamps. Blank values are skipped; every ref is stable, so
 * running this twice produces the same plan and the migration's upsert never
 * duplicates a comment.
 */
export function buildAvailabilityCommentBackfill(
  availabilities: StaffAvailabilityNoteSource[],
  requests: EditRequestNoteSource[],
): AvailabilityCommentSeed[] {
  const out: AvailabilityCommentSeed[] = []

  function push(
    base: {
      legacyRef: string
      venueId: string
      staffId: string
      date: Date
      seriesId: string | null
      authorId: string | null
      createdAt: Date
    },
    body: string | null,
    source: AvailabilityCommentSource,
  ) {
    const text = clean(body)
    if (!text) return
    const date = availabilityDateKey(base.date)
    out.push({
      legacyRef: base.legacyRef,
      venueId: base.venueId,
      staffId: base.staffId,
      seriesId: base.seriesId,
      date,
      body: text,
      source,
      authorId: base.authorId,
      createdAt: base.createdAt,
    })
  }

  for (const row of availabilities) {
    const base = {
      venueId: row.venueId,
      staffId: row.staffId,
      date: row.date,
      seriesId: row.seriesId,
    }
    push(
      { ...base, legacyRef: `staffAvailability:${row.id}:notes`, authorId: row.staffId, createdAt: row.createdAt },
      row.notes,
      'WORKER_APP',
    )
    push(
      { ...base, legacyRef: `staffAvailability:${row.id}:reason`, authorId: row.staffId, createdAt: row.createdAt },
      row.reason,
      'WORKER_APP',
    )
    push(
      {
        ...base,
        legacyRef: `staffAvailability:${row.id}:reviewNote`,
        authorId: row.reviewedById,
        createdAt: row.reviewedAt ?? row.updatedAt,
      },
      row.reviewNote,
      'MANAGER',
    )
  }

  for (const row of requests) {
    const base = {
      venueId: row.venueId,
      staffId: row.staffId,
      date: row.date,
      seriesId: row.seriesId,
    }
    push(
      { ...base, legacyRef: `availabilityEditRequest:${row.id}:reason`, authorId: row.staffId, createdAt: row.createdAt },
      row.reason,
      'WORKER_APP',
    )
    push(
      {
        ...base,
        legacyRef: `availabilityEditRequest:${row.id}:reviewNote`,
        authorId: row.reviewedById,
        createdAt: row.reviewedAt ?? row.updatedAt,
      },
      row.reviewNote,
      'MANAGER',
    )
  }

  return out
}

/**
 * Decide what each legacy seed should do against the comments already present
 * (live OR soft-deleted), so the boot migration is idempotent across restarts:
 *
 * - same `legacyRef` already present  -> SKIP (never recreate/resurrect);
 * - same staff + date + body present  -> TOMBSTONE (reserve the ref as a
 *   soft-deleted row so a later boot skips it; the body is already represented,
 *   either by a normal comment or by a soft-deleted one);
 * - otherwise                         -> CREATE a live comment.
 *
 * Earlier actions in the same run count as present, so two legacy columns with
 * the same text become one live comment + one tombstone.
 */
export function planAvailabilityCommentBackfill(
  seeds: AvailabilityCommentSeed[],
  existing: ExistingAvailabilityComment[],
): AvailabilityCommentBackfillAction[] {
  const refs = new Set<string>()
  const bodies = new Set<string>()
  for (const row of existing) {
    if (row.legacyRef) refs.add(row.legacyRef)
    bodies.add(bodyKey(row.staffId, row.date, row.body))
  }

  return seeds.map((seed) => {
    if (refs.has(seed.legacyRef)) return { kind: 'SKIP', seed, reason: 'LEGACY_REF_EXISTS' } as const
    refs.add(seed.legacyRef)
    const key = bodyKey(seed.staffId, seed.date, seed.body)
    if (bodies.has(key)) return { kind: 'TOMBSTONE', seed } as const
    bodies.add(key)
    return { kind: 'CREATE', seed } as const
  })
}
