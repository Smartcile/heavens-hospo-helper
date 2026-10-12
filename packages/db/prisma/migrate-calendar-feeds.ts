/**
 * Moves a venue's legacy single Google Calendar / iCal URLs onto room feeds.
 *
 * Rooms used to be one implicit feed per venue (Venue.googleCalendarUrl +
 * Venue.icalFeedUrl). Each event space now has its own CalendarFeed row, so the
 * event roster can group imported events by room. This creates one feed per
 * importable URL (a multi-`src` Google embed expands to one feed per calendar)
 * and names it from the calendar id so the manager can rename it to the room.
 *
 * Idempotent: a venue that already has any CalendarFeed row is skipped, and the
 * legacy venue columns are left untouched (the sync still uses them as a
 * fallback while a venue has no feeds).
 *
 * Must run AFTER `prisma db push` (the new table is created by it).
 *
 *   npm run db:migrate-calendar-feeds
 */

import { prisma } from '../index'

function expandUrls(raw: string): string[] {
  const link = raw.trim()
  if (!link) return []
  if (/\/ical\/.*\.ics/i.test(link)) return [link]
  try {
    const u = new URL(link)
    const srcs = u.searchParams.getAll('src').filter(Boolean)
    if (srcs.length === 0) return link.includes('/embed?') ? [] : [link]
    return srcs.map(
      (id) => `https://calendar.google.com/calendar/ical/${encodeURIComponent(id)}/public/basic.ics`,
    )
  } catch {
    return []
  }
}

function suggestName(url: string, index: number, total: number): string {
  const m = url.match(/\/ical\/([^/]+)\//i)
  if (m) {
    const id = decodeURIComponent(m[1])
    const local = id.split('@')[0]?.replace(/[^a-z0-9]+/gi, ' ').trim()
    if (local && local.length > 1) {
      const base = local.toUpperCase()
      return total > 1 ? `${base} ${index + 1}` : base
    }
  }
  return `ROOM ${index + 1}`
}

async function main() {
  const venues = await prisma.venue.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, googleCalendarUrl: true, icalFeedUrl: true },
  })

  let created = 0
  let skipped = 0

  for (const venue of venues) {
    const existing = await prisma.calendarFeed.count({
      where: { venueId: venue.id, deletedAt: null },
    })
    if (existing > 0) {
      skipped++
      continue
    }

    const rows: { name: string; url: string; source: 'GOOGLE' | 'ICAL' }[] = []

    const google = (venue.googleCalendarUrl ?? '').trim()
    if (google) {
      const urls = expandUrls(google)
      urls.forEach((url, i) => rows.push({ name: suggestName(url, i, urls.length), url, source: 'GOOGLE' }))
    }

    const ical = (venue.icalFeedUrl ?? '').trim()
    if (ical) {
      const url = ical.replace(/^webcal:\/\//i, 'https://')
      rows.push({ name: suggestName(url, rows.length, rows.length + 1), url, source: 'ICAL' })
    }

    if (rows.length === 0) continue

    let sortOrder = 0
    for (const row of rows) {
      await prisma.calendarFeed.create({
        data: { ...row, venueId: venue.id, sortOrder: sortOrder++ },
      })
      created++
    }
  }

  console.log(`[calendar-feeds] created ${created} feed(s) across ${venues.length} venue(s), ${skipped} already had feeds`)
}

main()
  .catch((e) => {
    console.error('[calendar-feeds] migration failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
