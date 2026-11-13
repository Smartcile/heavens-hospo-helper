import { describe, it, expect } from 'vitest'
import {
  buildAvailabilityCommentBackfill,
  planAvailabilityCommentBackfill,
  type AvailabilityCommentSeed,
  type EditRequestNoteSource,
  type ExistingAvailabilityComment,
  type StaffAvailabilityNoteSource,
} from '../../../packages/db/prisma/availability-comment-backfill'
import { runAvailabilityCommentBackfill } from '../../../packages/db/prisma/availability-comments-migrate'

const at = (iso: string) => new Date(iso)

function availability(over: Partial<StaffAvailabilityNoteSource> = {}): StaffAvailabilityNoteSource {
  return {
    id: 'a1',
    venueId: 'v1',
    staffId: 'st1',
    date: at('2026-11-12T00:00:00.000Z'),
    seriesId: null,
    notes: null,
    reason: null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: at('2026-11-01T01:00:00.000Z'),
    updatedAt: at('2026-11-02T01:00:00.000Z'),
    ...over,
  }
}

function request(over: Partial<EditRequestNoteSource> = {}): EditRequestNoteSource {
  return {
    id: 'r1',
    venueId: 'v1',
    staffId: 'st1',
    date: at('2026-11-13T00:00:00.000Z'),
    seriesId: 's1',
    reason: null,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: at('2026-11-03T01:00:00.000Z'),
    updatedAt: at('2026-11-04T01:00:00.000Z'),
    ...over,
  }
}

describe('buildAvailabilityCommentBackfill', () => {
  it('maps worker notes/reason and manager review notes with their sources', () => {
    const rows = buildAvailabilityCommentBackfill(
      [availability({
        notes: '  UNI BREAK  ',
        reason: 'VIA TXT',
        reviewNote: 'CHECKED BY PHONE',
        reviewedById: 'm1',
        reviewedAt: at('2026-11-05T02:00:00.000Z'),
      })],
      [],
    )

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      legacyRef: 'staffAvailability:a1:notes',
      body: 'UNI BREAK',
      source: 'WORKER_APP',
      authorId: 'st1',
      date: '2026-11-12',
      venueId: 'v1',
      staffId: 'st1',
    })
    expect(rows[1]).toMatchObject({ legacyRef: 'staffAvailability:a1:reason', body: 'VIA TXT', source: 'WORKER_APP' })
    expect(rows[2]).toMatchObject({
      legacyRef: 'staffAvailability:a1:reviewNote',
      body: 'CHECKED BY PHONE',
      source: 'MANAGER',
      authorId: 'm1',
    })
    expect(rows[2].createdAt).toEqual(at('2026-11-05T02:00:00.000Z'))
  })

  it('falls back to updatedAt when a review note has no reviewedAt', () => {
    const rows = buildAvailabilityCommentBackfill(
      [availability({ reviewNote: 'LATE NOTE', reviewedById: 'm1' })],
      [],
    )
    expect(rows[0].createdAt).toEqual(at('2026-11-02T01:00:00.000Z'))
  })

  it('maps edit-request reason and review note', () => {
    const rows = buildAvailabilityCommentBackfill(
      [],
      [request({ reason: 'FAMILY', reviewNote: 'APPLIED', reviewedById: 'm1', reviewedAt: at('2026-11-06T00:00:00.000Z') })],
    )

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      legacyRef: 'availabilityEditRequest:r1:reason',
      body: 'FAMILY',
      source: 'WORKER_APP',
      authorId: 'st1',
      seriesId: 's1',
      date: '2026-11-13',
    })
    expect(rows[1]).toMatchObject({
      legacyRef: 'availabilityEditRequest:r1:reviewNote',
      body: 'APPLIED',
      source: 'MANAGER',
      authorId: 'm1',
    })
  })

  it('keeps duplicate bodies as separate seeds so each legacyRef can be reserved', () => {
    const rows = buildAvailabilityCommentBackfill(
      [availability({ notes: 'VIA TXT' })],
      [request({ date: at('2026-11-12T00:00:00.000Z'), reason: '  VIA TXT  ' })],
    )

    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.legacyRef)).toEqual([
      'staffAvailability:a1:notes',
      'availabilityEditRequest:r1:reason',
    ])
  })

  it('skips blank and whitespace-only values', () => {
    const rows = buildAvailabilityCommentBackfill(
      [availability({ notes: '   ', reason: null, reviewNote: '' })],
      [request({ reason: '  ', reviewNote: null })],
    )
    expect(rows).toHaveLength(0)
  })

  it('is deterministic so re-running the migration never duplicates', () => {
    const avails = [availability({ notes: 'ONE', reviewNote: 'TWO', reviewedById: 'm1' })]
    const reqs = [request({ reason: 'THREE' })]

    const first = buildAvailabilityCommentBackfill(avails, reqs)
    const second = buildAvailabilityCommentBackfill(avails, reqs)

    expect(second).toEqual(first)
    expect(new Set(first.map((r) => r.legacyRef)).size).toBe(first.length)
  })
})

interface StoredComment extends ExistingAvailabilityComment {
  id: string
}

/**
 * In-memory boot simulator: plan against the rows already present, then apply
 * the creates/tombstones. Mirrors the migration wrapper (including its
 * live-comment-only notes mirror).
 */
function runBoot(seeds: AvailabilityCommentSeed[], store: StoredComment[]): void {
  const actions = planAvailabilityCommentBackfill(seeds, store)
  for (const action of actions) {
    if (action.kind === 'SKIP') continue
    const { seed } = action
    store.push({
      id: `${store.length + 1}`,
      legacyRef: seed.legacyRef,
      staffId: seed.staffId,
      date: seed.date,
      body: seed.body,
      deletedAt: action.kind === 'TOMBSTONE' ? at('2026-12-01T00:00:00.000Z') : null,
    })
  }
}

function liveBodies(store: StoredComment[]): string[] {
  return store.filter((r) => !r.deletedAt).map((r) => r.body)
}

function addLive(store: StoredComment[], body: string, date = '2026-11-12'): void {
  store.push({ id: `n${store.length}`, legacyRef: null, staffId: 'st1', date, body, deletedAt: null })
}

function deleteLive(store: StoredComment[], body: string): void {
  const row = store.find((r) => !r.deletedAt && r.body === body)
  if (row) row.deletedAt = at('2026-12-02T00:00:00.000Z')
}

describe('planAvailabilityCommentBackfill (boot idempotency)', () => {
  it('creates one live comment and reserves a tombstone for a duplicate body', () => {
    const seeds = buildAvailabilityCommentBackfill(
      [availability({ notes: 'SICK' })],
      [request({ date: at('2026-11-12T00:00:00.000Z'), reason: 'SICK' })],
    )

    const actions = planAvailabilityCommentBackfill(seeds, [])
    expect(actions.map((a) => a.kind)).toEqual(['CREATE', 'TOMBSTONE'])
  })

  it('skips an existing live or deleted legacyRef', () => {
    const seeds = buildAvailabilityCommentBackfill([availability({ notes: 'SICK' })], [])
    for (const deletedAt of [null, at('2026-12-02T00:00:00.000Z')]) {
      const actions = planAvailabilityCommentBackfill(seeds, [{
        legacyRef: 'staffAvailability:a1:notes',
        staffId: 'st1',
        date: '2026-11-12',
        body: 'SICK',
        deletedAt,
      }])
      expect(actions[0].kind).toBe('SKIP')
    }
  })

  it('does not duplicate a normal comment added after boot 1, and survives its deletion', () => {
    const store: StoredComment[] = []

    // Boot 1: the legacy request reason becomes the live comment.
    runBoot(buildAvailabilityCommentBackfill(
      [availability()],
      [request({ date: at('2026-11-12T00:00:00.000Z'), reason: 'SICK' })],
    ), store)
    expect(liveBodies(store)).toEqual(['SICK'])

    // A normal comment is added in the app (no legacyRef), then deleted.
    addLive(store, 'LATE')
    expect(liveBodies(store)).toEqual(['SICK', 'LATE'])
    deleteLive(store, 'LATE')

    // Boot 2: notes now mirror 'SICK'; the live comment and the deleted normal
    // comment both still exist. Nothing new may be created.
    const before = store.length
    runBoot(buildAvailabilityCommentBackfill(
      [availability({ notes: 'SICK' })],
      [request({ date: at('2026-11-12T00:00:00.000Z'), reason: 'SICK' })],
    ), store)

    expect(store.length).toBe(before + 1) // only the new tombstone for staffAvailability:a1:notes
    expect(store[store.length - 1].deletedAt).not.toBeNull()
    expect(liveBodies(store)).toEqual(['SICK'])
  })

  it('never resurrects a deleted legacy comment from a duplicate request reason', () => {
    const store: StoredComment[] = []

    // Boot 1: notes and the request reason are identical. One live comment +
    // one tombstone reserves both deterministic refs.
    runBoot(buildAvailabilityCommentBackfill(
      [availability({ notes: 'SICK' })],
      [request({ date: at('2026-11-12T00:00:00.000Z'), reason: 'SICK' })],
    ), store)
    expect(liveBodies(store)).toEqual(['SICK'])
    expect(store.filter((r) => r.deletedAt)).toHaveLength(1)

    // The worker deletes the only live comment.
    deleteLive(store, 'SICK')

    // Boot 2 must not recreate it from the request reason.
    const before = store.length
    runBoot(buildAvailabilityCommentBackfill(
      [availability()],
      [request({ date: at('2026-11-12T00:00:00.000Z'), reason: 'SICK' })],
    ), store)

    expect(store.length).toBe(before)
    expect(liveBodies(store)).toEqual([])
  })

  it('boot-cycle runner never writes notes, even when a non-anchor series note drifted', async () => {
    const notes = new Map([
      ['2026-11-12', 'ANCHOR NOTE'],
      ['2026-11-19', 'NEWER SERIES NOTE'],
    ])
    const comments: ExistingAvailabilityComment[] = []
    const store = {
      listAvailabilityNotes: async () => [
        availability({ date: at('2026-11-12T00:00:00.000Z'), notes: 'ANCHOR NOTE' }),
        availability({ id: 'a2', date: at('2026-11-19T00:00:00.000Z'), notes: 'NEWER SERIES NOTE' }),
      ],
      listEditRequests: async () => [],
      listComments: async () => comments,
      createComment: async (seed: AvailabilityCommentSeed, deletedAt: Date | null) => {
        comments.push({
          legacyRef: seed.legacyRef,
          staffId: seed.staffId,
          date: seed.date,
          body: seed.body,
          deletedAt,
        })
      },
    }

    const first = await runAvailabilityCommentBackfill(store)
    expect(first).toEqual({ created: 2, tombstoned: 0, skipped: 0 })

    const before = new Map(notes)
    const second = await runAvailabilityCommentBackfill(store)

    expect(second).toEqual({ created: 0, tombstoned: 0, skipped: 2 })
    expect(notes).toEqual(before)
    expect(notes.get('2026-11-19')).toBe('NEWER SERIES NOTE')
  })
})
