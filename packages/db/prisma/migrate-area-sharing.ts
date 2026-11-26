/**
 * Shared-room backfill + room-on-legacy-uses (#189).
 *
 * Runs AFTER `prisma db push` creates the AreaVenue table and the nullable
 * Booking.areaId / Event.areaId columns, and BEFORE the seed.
 *
 *   owner AreaVenue row for every live Area
 *   Booking.areaId <- FloorPlanSetup.areaId (via seatingSetupId)
 *   Event.areaId   <- FloorPlanSetup.areaId (via setupId)
 *
 * Idempotent — owner rows upsert and already-assigned rows are skipped.
 *
 *   npm run db:migrate-area-sharing
 */

import { prisma } from '../index'
import {
  runAreaSharingBackfill,
  type AreaSharingStore,
} from './area-sharing-migration'

function prismaStore(): AreaSharingStore {
  return {
    listAreas: () =>
      prisma.area.findMany({
        where: { deletedAt: null },
        select: { id: true, venueId: true, deletedAt: true },
      }),
    ensureOwnerLink: async (areaId, venueId) => {
      await prisma.areaVenue.upsert({
        where: { areaId_venueId: { areaId, venueId } },
        update: { isOwner: true, deletedAt: null },
        create: { areaId, venueId, isOwner: true },
      })
    },
    listBookings: () =>
      prisma.booking.findMany({
        where: { deletedAt: null, areaId: null, seatingSetupId: { not: null } },
        select: { id: true, areaId: true, seatingSetupId: true, deletedAt: true },
      }),
    listEvents: () =>
      prisma.event.findMany({
        where: { deletedAt: null, areaId: null, setupId: { not: null } },
        select: { id: true, areaId: true, setupId: true, deletedAt: true },
      }),
    setupAreaId: async (setupId) => {
      const setup = await prisma.floorPlanSetup.findFirst({
        where: { id: setupId, deletedAt: null },
        select: { areaId: true },
      })
      return setup?.areaId ?? null
    },
    setBookingArea: async (bookingId, areaId) => {
      await prisma.booking.updateMany({
        where: { id: bookingId, areaId: null },
        data: { areaId },
      })
    },
    setEventArea: async (eventId, areaId) => {
      await prisma.event.updateMany({
        where: { id: eventId, areaId: null },
        data: { areaId },
      })
    },
  }
}

async function main() {
  const result = await runAreaSharingBackfill(prismaStore())
  console.log(
    `[area-sharing] ${result.ownerLinks} owner link(s), ${result.bookingsBackfilled} booking(s), ${result.eventsBackfilled} event(s) backfilled`,
  )
}

main()
  .catch((e) => {
    console.error('[area-sharing] migration failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
