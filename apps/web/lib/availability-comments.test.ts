import { describe, expect, it } from 'vitest'
import { isAvailabilityDateKey } from '@/lib/availability-comments'

describe('isAvailabilityDateKey', () => {
  it('accepts real YYYY-MM-DD days', () => {
    expect(isAvailabilityDateKey('2026-11-12')).toBe(true)
    expect(isAvailabilityDateKey('2028-02-29')).toBe(true)
  })

  it('rejects wrong shapes and impossible dates', () => {
    expect(isAvailabilityDateKey(null)).toBe(false)
    expect(isAvailabilityDateKey('')).toBe(false)
    expect(isAvailabilityDateKey('12-11-2026')).toBe(false)
    expect(isAvailabilityDateKey('2026-99-99')).toBe(false)
    expect(isAvailabilityDateKey('2027-02-29')).toBe(false)
    expect(isAvailabilityDateKey('2026-13-01')).toBe(false)
  })
})
