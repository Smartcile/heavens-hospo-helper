// Boot-time availability-comment backfill runner. Pure enough to test with an
// in-memory store: it deliberately has NO way to write StaffAvailability.notes.
// Runtime comment writes mirror notes via mirrorAvailabilityCommentNotes; the
// boot pass only maintains comments, so a restart cannot overwrite a newer
// series note on a non-anchor day.

import {
  buildAvailabilityCommentBackfill,
  planAvailabilityCommentBackfill,
  type AvailabilityCommentSeed,
  type EditRequestNoteSource,
  type ExistingAvailabilityComment,
  type StaffAvailabilityNoteSource,
} from './availability-comment-backfill'

export interface AvailabilityCommentBackfillStore {
  listAvailabilityNotes(): Promise<StaffAvailabilityNoteSource[]>
  listEditRequests(): Promise<EditRequestNoteSource[]>
  listComments(): Promise<ExistingAvailabilityComment[]>
  createComment(seed: AvailabilityCommentSeed, deletedAt: Date | null): Promise<void>
}

export interface AvailabilityCommentBackfillResult {
  created: number
  tombstoned: number
  skipped: number
}

export async function runAvailabilityCommentBackfill(
  store: AvailabilityCommentBackfillStore,
): Promise<AvailabilityCommentBackfillResult> {
  const [availabilities, requests, existing] = await Promise.all([
    store.listAvailabilityNotes(),
    store.listEditRequests(),
    store.listComments(),
  ])
  const seeds = buildAvailabilityCommentBackfill(availabilities, requests)
  const actions = planAvailabilityCommentBackfill(seeds, existing)

  let created = 0
  let tombstoned = 0
  let skipped = 0
  for (const action of actions) {
    if (action.kind === 'SKIP') {
      skipped++
      continue
    }
    const deletedAt = action.kind === 'TOMBSTONE' ? new Date() : null
    await store.createComment(action.seed, deletedAt)
    if (action.kind === 'TOMBSTONE') tombstoned++
    else created++
  }

  return { created, tombstoned, skipped }
}
