// Room calendar feeds — pure helpers, no Prisma, safe in client bundles.
//
// An event space (room) owns one CalendarFeed row. A manager pastes any
// supported link (Google embed with one or many `src` calendars, a Google iCal
// link, a webcal:// link or any .ics URL) and one row is created per actual
// calendar, so the event roster can group imported events by room.

import { googleEmbedToIcal } from '@/lib/ical'

export type FeedSource = 'GOOGLE' | 'ICAL'

export interface RoomFeedDraft {
  name: string
  url: string
  source: FeedSource
}

/** Trim and upgrade webcal:// (subscribe scheme) to https. */
export function normaliseFeedUrl(raw: string): string {
  return raw.trim().replace(/^webcal:\/\//i, 'https://')
}

function sourceFor(url: string): FeedSource {
  try {
    return new URL(url).hostname.endsWith('calendar.google.com') ? 'GOOGLE' : 'ICAL'
  } catch {
    return 'ICAL'
  }
}

/**
 * Expand a pasted link into one draft per importable calendar.
 * A Google embed with N `src` parameters becomes N drafts named `NAME 1`…;
 * anything else becomes a single draft with the given name. Empty when the
 * link cannot be turned into a feed (caller should 400).
 */
export function expandRoomFeed(name: string, rawUrl: string): RoomFeedDraft[] {
  const url = normaliseFeedUrl(rawUrl)
  if (!url || !/^https?:\/\//i.test(url)) return []

  const label = name.trim().toUpperCase()
  let urls = googleEmbedToIcal(url)
  if (urls.length === 0) {
    // Not an expandable Google link: any other https URL is used as-is, but an
    // unsupported Google link (e.g. ?cid=) is rejected rather than stored raw.
    if (url.includes('calendar.google.com')) return []
    urls = [url]
  }

  if (urls.length === 1) {
    return [{ name: label, url: urls[0], source: sourceFor(urls[0]) }]
  }
  return urls.map((u, i) => ({
    name: `${label} ${i + 1}`,
    url: u,
    source: sourceFor(u),
  }))
}

/** Best-effort room name from a feed URL (Google iCal id local-part). */
export function suggestRoomName(url: string): string | null {
  const m = normaliseFeedUrl(url).match(/\/ical\/([^/]+)\//i)
  if (!m) return null
  const local = decodeURIComponent(m[1]).split('@')[0]?.replace(/[^a-z0-9]+/gi, ' ').trim()
  return local && local.length > 1 ? local.toUpperCase() : null
}
