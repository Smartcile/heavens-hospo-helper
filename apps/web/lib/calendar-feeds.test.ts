import { describe, it, expect } from 'vitest'
import { normaliseFeedUrl, expandRoomFeed, suggestRoomName } from '@/lib/calendar-feeds'

describe('normaliseFeedUrl', () => {
  it('trims and upgrades webcal links', () => {
    expect(normaliseFeedUrl('  webcal://example.com/feed.ics ')).toBe('https://example.com/feed.ics')
  })

  it('leaves https links alone', () => {
    expect(normaliseFeedUrl('https://example.com/feed.ics')).toBe('https://example.com/feed.ics')
  })
})

describe('expandRoomFeed', () => {
  it('creates a single feed from a plain .ics URL', () => {
    const rows = expandRoomFeed('te kawau room', 'https://example.com/room.ics')
    expect(rows).toEqual([{ name: 'TE KAWAU ROOM', url: 'https://example.com/room.ics', source: 'ICAL' }])
  })

  it('classifies Google iCal URLs as GOOGLE', () => {
    const url = 'https://calendar.google.com/calendar/ical/abc%40gmail.com/public/basic.ics'
    const rows = expandRoomFeed('RANGITOTO', url)
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('GOOGLE')
  })

  it('expands a multi-src Google embed into one feed per calendar', () => {
    const embed =
      'https://calendar.google.com/calendar/embed?src=one%40gmail.com&src=two%40gmail.com'
    const rows = expandRoomFeed('ROOM', embed)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.name)).toEqual(['ROOM 1', 'ROOM 2'])
    expect(rows.every((r) => r.source === 'GOOGLE')).toBe(true)
    expect(rows[0].url).toContain(encodeURIComponent('one@gmail.com'))
  })

  it('keeps the plain name for a single-src embed', () => {
    const embed = 'https://calendar.google.com/calendar/embed?src=one%40gmail.com'
    const rows = expandRoomFeed('HUI ROOM', embed)
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('HUI ROOM')
  })

  it('returns empty for unusable links', () => {
    expect(expandRoomFeed('X', '')).toEqual([])
    expect(expandRoomFeed('X', 'not-a-url')).toEqual([])
    expect(expandRoomFeed('X', 'https://calendar.google.com/calendar/u/0?cid=abc')).toEqual([])
  })
})

describe('suggestRoomName', () => {
  it('extracts the Google calendar id local-part', () => {
    const url = 'https://calendar.google.com/calendar/ical/hmsccomms%40gmail.com/public/basic.ics'
    expect(suggestRoomName(url)).toBe('HMSCCOMMS')
  })

  it('returns null when there is no calendar id', () => {
    expect(suggestRoomName('https://example.com/feed.ics')).toBeNull()
  })
})
