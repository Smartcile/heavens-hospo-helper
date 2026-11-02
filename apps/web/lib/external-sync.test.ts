import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockVenueFindFirst, mockFeedFindMany, mockFeedUpdate, mockEventUpsert, mockEventSweep, mockVenueUpdate, mockFetchIcs } =
  vi.hoisted(() => ({
    mockVenueFindFirst: vi.fn(),
    mockFeedFindMany: vi.fn(),
    mockFeedUpdate: vi.fn(),
    mockEventUpsert: vi.fn(),
    mockEventSweep: vi.fn(),
    mockVenueUpdate: vi.fn(),
    mockFetchIcs: vi.fn(),
  }))

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    venue: { findFirst: mockVenueFindFirst, update: mockVenueUpdate },
    calendarFeed: { findMany: mockFeedFindMany, update: mockFeedUpdate },
    calendarEvent: { upsert: mockEventUpsert, updateMany: mockEventSweep },
  },
}))

vi.mock('@/lib/ical', () => ({
  feedsForVenue: vi.fn(() => []),
  fetchAndParseIcs: mockFetchIcs,
}))

import { syncVenueCalendar } from '@/lib/external-sync'

describe('external-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFeedFindMany.mockResolvedValue([])
    mockEventUpsert.mockResolvedValue({})
    mockEventSweep.mockResolvedValue({ count: 0 })
    mockFeedUpdate.mockResolvedValue({})
    mockVenueUpdate.mockResolvedValue({})
    mockFetchIcs.mockResolvedValue([])
  })

  describe('syncVenueCalendar', () => {
    it('returns error when venue not found', async () => {
      mockVenueFindFirst.mockResolvedValue(null)
      const result = await syncVenueCalendar('unknown')
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('VENUE NOT FOUND')
    })

    it('returns early when no importable feeds', async () => {
      mockVenueFindFirst.mockResolvedValue({
        id: 'v1',
        googleCalendarUrl: null,
        icalFeedUrl: null,
      })
      const result = await syncVenueCalendar('v1')
      expect(result.ok).toBe(true)
      expect(result.imported).toBe(0)
      expect(result.message).toBe('NO IMPORTABLE FEEDS')
    })

    it('returns early when venue has empty feed URLs', async () => {
      mockVenueFindFirst.mockResolvedValue({
        id: 'v1',
        googleCalendarUrl: '',
        icalFeedUrl: '',
      })
      const result = await syncVenueCalendar('v1')
      expect(result.message).toBe('NO IMPORTABLE FEEDS')
    })

    it('imports room feed events, links them to the feed and its floor plan, then sweeps stale ones', async () => {
      mockVenueFindFirst.mockResolvedValue({ id: 'v1', googleCalendarUrl: null, icalFeedUrl: null })
      mockFeedFindMany.mockResolvedValue([
        {
          id: 'feed-1',
          name: 'TE KAWAU ROOM',
          source: 'ICAL',
          url: 'https://example.com/room.ics',
          floorPlan: { slug: 'te-kawau', name: 'TE KAWAU ROOM' },
        },
      ])
      mockFetchIcs.mockResolvedValue([
        {
          uid: 'ev-1',
          title: 'town hall',
          description: null,
          location: 'Te Kawau Room',
          startsAt: new Date('2025-11-15T09:00:00Z'),
          endsAt: new Date('2025-11-15T17:00:00Z'),
          allDay: false,
        },
      ])
      mockEventSweep.mockResolvedValue({ count: 2 })

      const result = await syncVenueCalendar('v1')

      expect(result.ok).toBe(true)
      expect(result.imported).toBe(1)
      expect(result.removed).toBe(2)
      expect(mockEventUpsert).toHaveBeenCalledTimes(1)
      const call = mockEventUpsert.mock.calls[0][0]
      expect(call.create.title).toBe('TOWN HALL')
      expect(call.create.feedId).toBe('feed-1')
      expect(call.create.floorPlanSlug).toBe('te-kawau')
      expect(mockFeedUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'feed-1' } }),
      )
      expect(mockVenueUpdate).toHaveBeenCalled()
    })

    it('keeps other feeds intact when one room feed fails', async () => {
      mockVenueFindFirst.mockResolvedValue({ id: 'v1', googleCalendarUrl: null, icalFeedUrl: null })
      mockFeedFindMany.mockResolvedValue([
        { id: 'feed-1', name: 'ROOM A', source: 'ICAL', url: 'https://example.com/a.ics', floorPlan: null },
        { id: 'feed-2', name: 'ROOM B', source: 'ICAL', url: 'https://example.com/b.ics', floorPlan: null },
      ])
      mockFetchIcs.mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce([])

      const result = await syncVenueCalendar('v1')

      expect(result.ok).toBe(true)
      expect(result.errors[0]).toContain('ROOM A')
      expect(mockEventSweep).toHaveBeenCalledTimes(1)
      expect(mockEventSweep.mock.calls[0][0].where.feedId).toBe('feed-2')
    })
  })
})
