// Boot area backfill — the decision logic, split from Prisma so it is testable.
//
// A "room" used to be a CalendarFeed row. This migration promotes each live
// unassigned feed into a first-class Area, but ONLY when the feed name looks
// human-authored. Bulk calendar imports were named after the calendar
// identifier, and blindly turning those into rooms is what produced junk rooms.
// An opaque name is left unassigned and marked `roomDismissed` so a later boot
// never reconsiders it.

import { isHumanRoomName } from '../../../apps/web/lib/room-names'

export interface AreaMigrationFeed {
  id: string
  venueId: string
  areaId: string | null
  name: string
  colour: string | null
  floorPlanId: string | null
  sortOrder: number
  notes: string | null
  roomDismissed: boolean
}

export interface AreaMigrationStore {
  /** Live feeds with no area, oldest sort order first. */
  listUnassignedFeeds(): Promise<AreaMigrationFeed[]>
  /** Create the Area for a feed (copies the feed's presentation fields). */
  createAreaForFeed(feed: AreaMigrationFeed): Promise<string>
  linkFeedToArea(feedId: string, areaId: string): Promise<void>
  /** Mark a feed so no future boot tries to infer a room for it. */
  dismissFeed(feedId: string): Promise<void>
  /** Every live feed that has an area (for the event backfill). */
  listLinkedFeeds(): Promise<{ id: string; areaId: string }[]>
  /** Give a feed's still-unassigned events the feed's area. */
  backfillEvents(feedId: string, areaId: string): Promise<number>
}

export interface AreaMigrationResult {
  created: number
  /** Names left unassigned because they are calendar identifiers, not rooms. */
  dismissed: string[]
  eventsBackfilled: number
}

export async function runAreaMigration(store: AreaMigrationStore): Promise<AreaMigrationResult> {
  const feeds = await store.listUnassignedFeeds()

  let created = 0
  const dismissed: string[] = []

  for (const feed of feeds) {
    if (feed.roomDismissed) continue
    if (!isHumanRoomName(feed.name)) {
      await store.dismissFeed(feed.id)
      dismissed.push(feed.name)
      continue
    }
    const areaId = await store.createAreaForFeed(feed)
    await store.linkFeedToArea(feed.id, areaId)
    created++
  }

  // Imported events follow their feed's area (never overwrites a manual link).
  let eventsBackfilled = 0
  for (const feed of await store.listLinkedFeeds()) {
    eventsBackfilled += await store.backfillEvents(feed.id, feed.areaId)
  }

  return { created, dismissed, eventsBackfilled }
}
