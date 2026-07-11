import { describe, it, expect } from 'vitest'
import { haversineDistance, isWithinGeoFence } from '@/lib/geo'

describe('haversineDistance', () => {
  it('returns 0 for same point', () => {
    expect(haversineDistance(40.7128, -74.006, 40.7128, -74.006)).toBe(0)
  })

  it('returns reasonable NYC distance (~3.5km)', () => {
    const d = haversineDistance(40.7128, -74.006, 40.758, -73.9855) // NYC midtown to times sq
    expect(d).toBeGreaterThan(3000)
    expect(d).toBeLessThan(6000)
  })

  it('returns large distance for far points', () => {
    const d = haversineDistance(40.7128, -74.006, -33.8688, 151.2093) // NYC to Sydney
    expect(d).toBeGreaterThan(15000000)
  })
})

describe('isWithinGeoFence', () => {
  it('passes when venue has no geo config', () => {
    expect(isWithinGeoFence(41, -74, null, null, null)).toBe(true)
    expect(isWithinGeoFence(41, -74, 40.7, null, 100)).toBe(true)
    expect(isWithinGeoFence(41, -74, null, -74, 100)).toBe(true)
  })

  it('passes when within radius', () => {
    expect(isWithinGeoFence(40.7128, -74.006, 40.7129, -74.006, 100)).toBe(true)
  })

  it('fails when outside radius', () => {
    expect(isWithinGeoFence(40.8, -74.1, 40.7128, -74.006, 100)).toBe(false)
  })
})
