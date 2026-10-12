// Calendar import engine. Pulls each venue's room feeds (CalendarFeed rows —
// one per event space) and reconciles them into the local CalendarEvent table:
//   • upsert by (venueId, source, uid)  → changed events UPDATE in place
//   • soft-delete events no longer in the feed, per feed → removed events disappear
// This is the "update, no double-up" guarantee. Runs on demand from the
// Calendar / event roster pages (no background cron needed for a single-instance
// self-hosted deploy).
//
// A venue with no CalendarFeed rows falls back to its legacy single
// googleCalendarUrl / icalFeedUrl fields (until the calendar-feeds migration
// has run). Events imported from a feed inherit the feed's floor plan, so the
// worker floor plan auto-switches to the right room layout.

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

interface RoomFeed {
  /** null = synthesized from the venue's legacy URL fields (never saved) */
  id: string | null
  name: string
  source: CalendarSource
  url: string
  areaId: string | null
  floorPlanSlug: string | null
  floorPlanName: string | null
}

interface VenueForSync {
  id: string
  googleCalendarUrl: string | null
  icalFeedUrl: string | null
}

async function loadFeeds(venue: VenueForSync): Promise<RoomFeed[]> {
  const rows = await prisma.calendarFeed.findMany({
    where: { venueId: venue.id, deletedAt: null, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      floorPlan: { select: { slug: true, name: true } },
      area: { select: { id: true, floorPlan: { select: { slug: true, name: true } } } },
    },
  })

  if (rows.length > 0) {
    return rows.map((f) => {
      // The area's floor plan is the source of truth when the feed is linked.
      const plan = f.area?.floorPlan ?? f.floorPlan
      return {
        id: f.id,
        name: f.name,
        source: f.source,
        url: f.url,
        areaId: f.areaId,
        floorPlanSlug: plan?.slug ?? null,
        floorPlanName: plan?.name ?? null,
      }
    })
  }

  // Legacy fallback: the venue's two single-URL fields.
  return feedsForVenue(venue).map((f, i) => ({
    id: null,
    name: `LEGACY FEED ${i + 1}`,
    source: f.source,
    url: f.url,
    areaId: null,
    floorPlanSlug: null,
    floorPlanName: null,
  }))
}

export async function syncVenueCalendar(venueId: string): Promise<SyncResult> {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { id: true, googleCalendarUrl: true, icalFeedUrl: true },
  })
  if (!venue) return { ok: false, imported: 0, removed: 0, errors: ['VENUE NOT FOUND'] }

  const feeds = await loadFeeds(venue)
  if (feeds.length === 0) {
    return { ok: true, imported: 0, removed: 0, errors: [], message: 'NO IMPORTABLE FEEDS' }
  }

  let imported = 0
  let removed = 0
  const errors: string[] = []
  let anySuccess = false
  // Legacy feeds share one sweep per source (a Google embed expands to several
  // feeds of the same source) — accumulate their uids first.
  const legacySeen = new Map<CalendarSource, Set<string>>()
  const legacyFailed = new Set<CalendarSource>()

  for (const feed of feeds) {
    const seen = new Set<string>()
    try {
      const events = await fetchAndParseIcs(feed.url)
      for (const ev of events) {
        if (seen.has(ev.uid)) continue // de-dup within a feed
        seen.add(ev.uid)

        const layout = feed.floorPlanSlug
          ? { floorPlanSlug: feed.floorPlanSlug, floorPlanName: feed.floorPlanName }
          : {}

        await prisma.calendarEvent.upsert({
          where: {
            venueId_source_uid: { venueId, source: feed.source, uid: ev.uid },
          },
          create: {
            venueId,
            source: feed.source,
            ...(feed.id ? { feedId: feed.id } : {}),
            uid: ev.uid,
            title: ev.title.toUpperCase(),
            description: ev.description,
            location: ev.location,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            allDay: ev.allDay,
            ...layout,
          },
          update: {
            title: ev.title.toUpperCase(),
            description: ev.description,
            location: ev.location,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            allDay: ev.allDay,
            ...(feed.id ? { feedId: feed.id } : {}),
            ...layout,
            lastSyncedAt: new Date(),
            deletedAt: null, // un-delete if it reappeared
          },
        })
        imported++
      }
      anySuccess = true

      if (feed.id) {
        // Sweep stale events for this feed only, and only when it fetched
        // cleanly — otherwise a transient fetch error would delete everything.
        const sweep = await prisma.calendarEvent.updateMany({
          where: {
            venueId,
            feedId: feed.id,
            deletedAt: null,
            ...(seen.size > 0 ? { uid: { notIn: Array.from(seen) } } : {}),
          },
          data: { deletedAt: new Date() },
        })
        removed += sweep.count
        await prisma.calendarFeed.update({
          where: { id: feed.id },
          data: { lastSyncedAt: new Date() },
        })
      } else {
        const acc = legacySeen.get(feed.source) ?? new Set<string>()
        for (const uid of seen) acc.add(uid)
        legacySeen.set(feed.source, acc)
      }
    } catch (e) {
      errors.push(`${feed.name}: ${(e as Error).message}`)
      if (!feed.id) legacyFailed.add(feed.source)
    }
  }

  // Legacy synthesized feeds: sweep per source once all of its feeds fetched
  // cleanly. Only un-feeded rows of that source (MANUAL events — BEO pushes,
  // bookings — are never swept).
  for (const [source, seen] of legacySeen) {
    if (legacyFailed.has(source)) continue
    const sweep = await prisma.calendarEvent.updateMany({
      where: {
        venueId,
        source,
        feedId: null,
        deletedAt: null,
        ...(seen.size > 0 ? { uid: { notIn: Array.from(seen) } } : {}),
      },
      data: { deletedAt: new Date() },
    })
    removed += sweep.count
  }

  if (anySuccess) {
    await prisma.venue.update({ where: { id: venueId }, data: { lastExternalSyncAt: new Date() } })
  }

  return { ok: anySuccess, imported, removed, errors }
}

/** Sync every active venue (used when an admin syncs with no venue selected). */
export async function syncAllVenues(): Promise<SyncResult> {
  const venues = await prisma.venue.findMany({
    where: {
      deletedAt: null,
      isDemo: false,
      OR: [
        { calendarFeeds: { some: { deletedAt: null, isActive: true } } },
        { googleCalendarUrl: { not: null } },
        { icalFeedUrl: { not: null } },
      ],
    },
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
