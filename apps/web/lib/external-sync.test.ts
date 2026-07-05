import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockVenueFindFirst } = vi.hoisted(() => ({
  mockVenueFindFirst: vi.fn(),
}))

vi.mock('@hospo-ops/db', () => ({
  prisma: {
    venue: { findFirst: mockVenueFindFirst },
  },
}))

vi.mock('@/lib/ical', () => ({
  feedsForVenue: vi.fn(() => []),
}))

import { syncVenueCalendar } from '@/lib/external-sync'

describe('external-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })
})
