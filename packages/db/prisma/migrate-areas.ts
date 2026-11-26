/**
 * Moves room calendar feeds onto first-class Areas.
 *
 * A "room" used to be a CalendarFeed row — a space could not exist without a
 * calendar URL. Areas are now a separate model: each live CalendarFeed with a
 * human-authored name gets its own Area (name/colour/floor-plan/order/notes
 * copied over) and is linked to it via CalendarFeed.areaId, so the event roster
 * groups by Area and an area with no calendar is possible. Existing imported
 * CalendarEvents inherit their feed's area.
 *
 * Feeds named after an opaque calendar identifier are NOT promoted — they are
 * left unassigned and marked `roomDismissed`, so bulk calendar imports never
 * create junk rooms. A feed whose room a manager removed is marked the same way
 * by the area DELETE route, so deleting a room stays deleted across boots.
 *
 * Idempotent: feeds that already have an areaId are skipped, and every step
 * re-checks its own state, so a half-finished run resumes on the next boot.
 *
 * Must run AFTER `prisma db push` (the Area table is created by it).
 *
 *   npm run db:migrate-areas
 */

import { prisma } from '../index'
import {
  runAreaMigration,
  type AreaMigrationFeed,
  type AreaMigrationStore,
} from './area-migration'

function prismaStore(): AreaMigrationStore {
  return {
    listUnassignedFeeds: () =>
      prisma.calendarFeed.findMany({
        where: { deletedAt: null, areaId: null },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          venueId: true,
          areaId: true,
          name: true,
          colour: true,
          floorPlanId: true,
          sortOrder: true,
          notes: true,
          roomDismissed: true,
        },
      }),
    createAreaForFeed: async (feed: AreaMigrationFeed) => {
      const area = await prisma.area.create({
        data: {
          venueId: feed.venueId,
          name: feed.name,
          colour: feed.colour,
          floorPlanId: feed.floorPlanId,
          sortOrder: feed.sortOrder,
          notes: feed.notes,
        },
        select: { id: true },
      })
      return area.id
    },
    linkFeedToArea: async (feedId, areaId) => {
      await prisma.calendarFeed.update({ where: { id: feedId }, data: { areaId } })
    },
    dismissFeed: async (feedId) => {
      await prisma.calendarFeed.update({ where: { id: feedId }, data: { roomDismissed: true } })
    },
    listLinkedFeeds: () =>
      prisma.calendarFeed.findMany({
        where: { deletedAt: null, areaId: { not: null } },
        select: { id: true, areaId: true },
      }) as Promise<{ id: string; areaId: string }[]>,
    backfillEvents: async (feedId, areaId) => {
      const res = await prisma.calendarEvent.updateMany({
        where: { feedId, areaId: null },
        data: { areaId },
      })
      return res.count
    },
  }
}

async function main() {
  const result = await runAreaMigration(prismaStore())

  if (result.dismissed.length > 0) {
    console.log(
      `[areas] left ${result.dismissed.length} feed(s) unassigned (calendar identifiers, not room names): ${result.dismissed.join(', ')}`,
    )
  }
  console.log(
    `[areas] created ${result.created} area(s) for unlinked feed(s), linked ${result.eventsBackfilled} event(s)`,
  )
}

main()
  .catch((e) => {
    console.error('[areas] migration failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
