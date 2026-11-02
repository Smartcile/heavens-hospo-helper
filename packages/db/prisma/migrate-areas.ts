/**
 * Moves room calendar feeds onto first-class Areas.
 *
 * A "room" used to be a CalendarFeed row — a space could not exist without a
 * calendar URL. Areas are now a separate model: each live CalendarFeed gets its
 * own Area (name/colour/floor-plan/order/notes copied over) and is linked to it
 * via CalendarFeed.areaId, so the event roster groups by Area and an area with
 * no calendar is possible. Existing imported CalendarEvents inherit their
 * feed's area.
 *
 * Idempotent: feeds that already have an areaId are skipped, and every step
 * re-checks its own state, so a half-finished run resumes on the next boot.
 *
 * Must run AFTER `prisma db push` (the Area table is created by it).
 *
 *   npm run db:migrate-areas
 */

import { prisma } from '../index'

async function main() {
  const feeds = await prisma.calendarFeed.findMany({
    where: { deletedAt: null, areaId: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  let created = 0
  let eventsBackfilled = 0

  for (const feed of feeds) {
    const area = await prisma.area.create({
      data: {
        venueId: feed.venueId,
        name: feed.name,
        colour: feed.colour,
        floorPlanId: feed.floorPlanId,
        sortOrder: feed.sortOrder,
        notes: feed.notes,
      },
    })
    await prisma.calendarFeed.update({
      where: { id: feed.id },
      data: { areaId: area.id },
    })
    created++
  }

  // Imported events follow their feed's area (never overwrites a manual link).
  const links = await prisma.calendarFeed.findMany({
    where: { deletedAt: null, areaId: { not: null } },
    select: { id: true, areaId: true },
  })
  for (const feed of links) {
    const res = await prisma.calendarEvent.updateMany({
      where: { feedId: feed.id, areaId: null },
      data: { areaId: feed.areaId },
    })
    eventsBackfilled += res.count
  }

  console.log(
    `[areas] created ${created} area(s) for unlinked feed(s), linked ${eventsBackfilled} event(s)`,
  )
}

main()
  .catch((e) => {
    console.error('[areas] migration failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
