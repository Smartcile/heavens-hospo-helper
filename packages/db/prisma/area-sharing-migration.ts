// Boot backfill for shared rooms (#189) — decision logic split from Prisma so it
// is unit-testable.
//
// 1. Every live Area gets an owner `AreaVenue` row, so the union read
//    (`areaWhereForVenues`) is uniform whether or not a room was ever shared.
// 2. Every Booking/Event with no `areaId` inherits the area of its linked
//    FloorPlanSetup, so the space-availability view has rooms on legacy rows.
//
// Idempotent: owner rows are upserted by (areaId, venueId) and rows that already
// have an areaId are skipped, so a second run writes nothing.

export interface AreaSharingArea {
  id: string
  venueId: string
  deletedAt: Date | null
}

export interface AreaSharingBooking {
  id: string
  areaId: string | null
  seatingSetupId: string | null
  deletedAt: Date | null
}

export interface AreaSharingEvent {
  id: string
  areaId: string | null
  setupId: string | null
  deletedAt: Date | null
}

export interface AreaSharingStore {
  listAreas(): Promise<AreaSharingArea[]>
  ensureOwnerLink(areaId: string, venueId: string): Promise<void>
  listBookings(): Promise<AreaSharingBooking[]>
  listEvents(): Promise<AreaSharingEvent[]>
  /** The area of a FloorPlanSetup, or null when the setup is missing/unlinked. */
  setupAreaId(setupId: string): Promise<string | null>
  setBookingArea(bookingId: string, areaId: string): Promise<void>
  setEventArea(eventId: string, areaId: string): Promise<void>
}

export interface AreaSharingResult {
  ownerLinks: number
  bookingsBackfilled: number
  eventsBackfilled: number
}

export async function runAreaSharingBackfill(
  store: AreaSharingStore,
): Promise<AreaSharingResult> {
  let ownerLinks = 0
  for (const area of await store.listAreas()) {
    if (area.deletedAt) continue
    await store.ensureOwnerLink(area.id, area.venueId)
    ownerLinks++
  }

  let bookingsBackfilled = 0
  for (const booking of await store.listBookings()) {
    if (booking.deletedAt || booking.areaId || !booking.seatingSetupId) continue
    const areaId = await store.setupAreaId(booking.seatingSetupId)
    if (!areaId) continue
    await store.setBookingArea(booking.id, areaId)
    bookingsBackfilled++
  }

  let eventsBackfilled = 0
  for (const event of await store.listEvents()) {
    if (event.deletedAt || event.areaId || !event.setupId) continue
    const areaId = await store.setupAreaId(event.setupId)
    if (!areaId) continue
    await store.setEventArea(event.id, areaId)
    eventsBackfilled++
  }

  return { ownerLinks, bookingsBackfilled, eventsBackfilled }
}
