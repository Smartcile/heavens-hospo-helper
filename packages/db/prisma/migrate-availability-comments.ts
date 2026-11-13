/**
 * Converts the old availability note columns into comment-thread history.
 *
 * Availability used to keep three separate note areas — the worker's `notes`,
 * the request `reason` and the manager's `reviewNote`. They are now one
 * AvailabilityComment thread per staff member + day. This copies every non-blank
 * old value into a comment with its original author and timestamp.
 *
 * Idempotent: every row gets a deterministic `legacyRef` and the planner skips
 * an existing ref, tombstones a body already represented by another comment, and
 * only otherwise creates a live comment. Running this on every boot therefore
 * never duplicates a normal comment or resurrects a deleted one.
 *
 * Must run AFTER `prisma db push` (the AvailabilityComment table is created by
 * it) and after the availability/time-off migration.
 *
 * IMPORTANT: this only maintains comments. It never writes
 * StaffAvailability.notes — runtime comment writes handle the note mirror, and
 * a boot re-mirror would overwrite a newer series note on a non-anchor day.
 *
 *   npm run db:migrate-availability-comments
 */

import { prisma } from '../index'
import { availabilityDateKey } from './availability-comment-backfill'
import { runAvailabilityCommentBackfill } from './availability-comments-migrate'

async function main() {
  const result = await runAvailabilityCommentBackfill({
    listAvailabilityNotes: () => prisma.staffAvailability.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        venueId: true,
        staffId: true,
        date: true,
        seriesId: true,
        notes: true,
        reason: true,
        reviewNote: true,
        reviewedById: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    listEditRequests: () => prisma.availabilityEditRequest.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        venueId: true,
        staffId: true,
        date: true,
        seriesId: true,
        reason: true,
        reviewNote: true,
        reviewedById: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    listComments: async () => {
      const rows = await prisma.availabilityComment.findMany({
        select: { legacyRef: true, staffId: true, date: true, body: true, deletedAt: true },
      })
      return rows.map((row) => ({
        legacyRef: row.legacyRef,
        staffId: row.staffId,
        date: availabilityDateKey(row.date),
        body: row.body,
        deletedAt: row.deletedAt,
      }))
    },
    createComment: async (seed, deletedAt) => {
      const { date, ...rest } = seed
      await prisma.availabilityComment.create({
        data: { ...rest, date: new Date(`${date}T00:00:00.000Z`), deletedAt },
      })
    },
  })

  console.log(
    `[availability-comments] created ${result.created} live comment(s), reserved ${result.tombstoned} tombstone(s), skipped ${result.skipped}`,
  )
}

main()
  .catch((e) => {
    console.error('[availability-comments] migration failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
