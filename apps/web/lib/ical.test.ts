import { describe, it, expect } from 'vitest'
import { googleEmbedToIcal, feedsForVenue } from '@/lib/ical'

describe('googleEmbedToIcal', () => {
  it('passes through iCal links', () => {
    const link = 'https://calendar.google.com/calendar/ical/abc/basic.ics'
    expect(googleEmbedToIcal(link)).toEqual([link])
  })

  it('returns empty array for invalid links', () => {
    expect(googleEmbedToIcal('')).toEqual([])
    expect(googleEmbedToIcal('not-a-url')).toEqual([])
  })

  it('rejects unsupported Google link format gracefully', () => {
    expect(googleEmbedToIcal('https://calendar.google.com/calendar/u/0?cid=abc')).toEqual([])
  })
})

describe('feedsForVenue', () => {
  it('returns ICAL feeds for provided URLs', () => {
    const feeds = feedsForVenue({ googleCalendarUrl: null, icalFeedUrl: 'https://example.com/feed.ics' })
    expect(feeds).toHaveLength(1)
    expect(feeds[0].source).toBe('ICAL')
    expect(feeds[0].url).toBe('https://example.com/feed.ics')
  })

  it('converts webcal to https', () => {
    const feeds = feedsForVenue({ googleCalendarUrl: null, icalFeedUrl: 'webcal://example.com/feed.ics' })
    expect(feeds[0].url).toBe('https://example.com/feed.ics')
  })

  it('returns empty for no feeds configured', () => {
    expect(feedsForVenue({ googleCalendarUrl: null, icalFeedUrl: null })).toEqual([])
    expect(feedsForVenue({ googleCalendarUrl: '', icalFeedUrl: '' })).toEqual([])
  })

  it('handles Google iCal URL', () => {
    const link = 'https://calendar.google.com/calendar/ical/abc123/basic.ics'
    const feeds = feedsForVenue({ googleCalendarUrl: link, icalFeedUrl: null })
    expect(feeds).toHaveLength(1)
    expect(feeds[0].source).toBe('GOOGLE')
  })
})
