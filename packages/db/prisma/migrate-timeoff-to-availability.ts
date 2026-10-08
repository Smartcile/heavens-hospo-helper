/**
 * Moves legacy TimeOffRequest rows onto the unified availability calendar.
 *
 * Time off used to be its own model with its own worker request form. It now
 * lives on StaffAvailability: each date of a request becomes an all-day
 * UNAVAILABLE row flagged `timeOff`, carrying the request's status, reason and
 * review data. The request is soft-deleted afterwards, so the migration is
 * idempotent — a re-run (or a run after a partial failure) simply finds nothing.
 *
 * A pre-existing availability row for a date is upgraded in place (never
 * duplicated); a row already flagged `timeOff` is left alone.
 *
 * Must run AFTER `prisma db push` (the new columns are created by it).
 *
 *   npm run db:migrate-timeoff
 */

import { prisma } from '../index'

async function main() {
  const requests = await prisma.timeOffRequest.findMany({
    where: { deletedAt: null },
  })

  if (requests.length === 0) {
    console.log('[timeoff] no legacy time-off requests — nothing to do')
    return
  }

  let created = 0
  let upgraded = 0
  let skipped = 0

  for (const request of requests) {
    const days: Date[] = []
    for (let t = request.startDate.getTime(); t <= request.endDate.getTime(); t += 86_400_000) {
      days.push(new Date(t))
    }

    for (const day of days) {
      const existing = await prisma.staffAvailability.findUnique({
        where: { staffId_date: { staffId: request.staffId, date: day } },
        select: { id: true, timeOff: true },
      })

      if (existing?.timeOff) {
        skipped++
        continue
      }

      if (existing) {
        await prisma.staffAvailability.update({
          where: { id: existing.id },
          data: {
            timeOff: true,
            isAllDay: true,
            type: 'UNAVAILABLE',
            segments: null,
            status: request.status,
            reason: request.reason,
            reviewNote: request.reviewNote,
            reviewedById: request.reviewedById,
            reviewedAt: request.reviewedAt,
            deletedAt: null,
          },
        })
        upgraded++
      } else {
        await prisma.staffAvailability.create({
          data: {
            staffId: request.staffId,
            venueId: request.venueId,
            date: day,
            type: 'UNAVAILABLE',
            isAllDay: true,
            timeOff: true,
            status: request.status,
            reason: request.reason,
            reviewNote: request.reviewNote,
            reviewedById: request.reviewedById,
            reviewedAt: request.reviewedAt,
          },
        })
        created++
      }
    }

    await prisma.timeOffRequest.update({
      where: { id: request.id },
      data: { deletedAt: new Date() },
    })
  }

  console.log(`[timeoff] migrated ${requests.length} request(s) → ${created} day(s) created, ${upgraded} upgraded, ${skipped} already present`)
}

main()
  .catch((e) => {
    console.error('[timeoff] migration failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
