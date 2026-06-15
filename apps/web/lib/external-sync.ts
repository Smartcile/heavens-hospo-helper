// Calendar import engine. Pulls each venue's external iCal feeds and reconciles
// them into the local CalendarEvent table:
//   • upsert by (venueId, source, uid)  → changed events UPDATE in place
//   • soft-delete events no longer in the feed → removed events disappear
// This is the "update, no double-up" guarantee the user asked for. Runs on
// demand from the Calendar page (no background cron needed for a single-instance
// self-hosted deploy).

import { prisma } from '@hospo-ops/db'
import type { CalendarSource } from '@hospo-ops/db'
import { feedsForVenue, fetchAndParseIcs } from './ical'

export interface SyncResult {
  ok: boolean
  imported: number
  removed: number
  errors: string[]
  message?: string
}

export async function syncVenueCalendar(venueId: string): Promise<SyncResult> {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { id: true, googleCalendarUrl: true, icalFeedUrl: true },
  })
  if (!venue) return { ok: false, imported: 0, removed: 0, errors: ['VENUE NOT FOUND'] }

  const feeds = feedsForVenue(venue)
  if (feeds.length === 0) {
    return { ok: true, imported: 0, removed: 0, errors: [], message: 'NO IMPORTABLE FEEDS' }
  }

  let imported = 0
  let removed = 0
  const errors: string[] = []
  let anySuccess = false

  // Reconcile per source so one source's failure never wipes another's events.
  for (const source of ['GOOGLE', 'ICAL'] as CalendarSource[]) {
    const sourceFeeds = feeds.filter((f) => f.source === source)
    if (sourceFeeds.length === 0) continue

    const seen = new Set<string>()
    let sourceFailed = false

    for (const feed of sourceFeeds) {
      try {
        const events = await fetchAndParseIcs(feed.url)
        for (const ev of events) {
          if (seen.has(ev.uid)) continue // de-dup within a feed
          seen.add(ev.uid)
          await prisma.calendarEvent.upsert({
            where: { venueId_source_uid: { venueId, source, uid: ev.uid } },
            create: {
              venueId,
              source,
              uid: ev.uid,
              title: ev.title.toUpperCase(),
              description: ev.description,
              location: ev.location,
              startsAt: ev.startsAt,
              endsAt: ev.endsAt,
              allDay: ev.allDay,
            },
            update: {
              title: ev.title.toUpperCase(),
              description: ev.description,
              location: ev.location,
              startsAt: ev.startsAt,
              endsAt: ev.endsAt,
              allDay: ev.allDay,
              lastSyncedAt: new Date(),
              deletedAt: null, // un-delete if it reappeared
            },
          })
          imported++
        }
        anySuccess = true
      } catch (e) {
        sourceFailed = true
        errors.push(`${source}: ${(e as Error).message}`)
      }
    }

    // Only sweep stale events for a source whose feeds all fetched cleanly —
    // otherwise a transient fetch error would delete everything.
    if (!sourceFailed) {
      const sweep = await prisma.calendarEvent.updateMany({
        where: {
          venueId,
          source,
          deletedAt: null,
          ...(seen.size > 0 ? { uid: { notIn: Array.from(seen) } } : {}),
        },
        data: { deletedAt: new Date() },
      })
      removed += sweep.count
    }
  }

  if (anySuccess) {
    await prisma.venue.update({ where: { id: venueId }, data: { lastExternalSyncAt: new Date() } })
  }

  return { ok: anySuccess, imported, removed, errors }
}

/** Sync every active venue (used when an admin syncs with no venue selected). */
export async function syncAllVenues(): Promise<SyncResult> {
  const venues = await prisma.venue.findMany({
    where: { deletedAt: null, OR: [{ googleCalendarUrl: { not: null } }, { icalFeedUrl: { not: null } }] },
    select: { id: true },
  })
  let imported = 0
  let removed = 0
  const errors: string[] = []
  let ok = true
  for (const v of venues) {
    const r = await syncVenueCalendar(v.id)
    imported += r.imported
    removed += r.removed
    errors.push(...r.errors)
    if (!r.ok) ok = false
  }
  return { ok, imported, removed, errors }
}
