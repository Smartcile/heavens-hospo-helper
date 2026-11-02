import { describe, it, expect } from 'vitest'
import { nearestIndex } from './reorder'

// Three 64px tiles laid out left to right, 6px apart.
const rects = [
  { left: 0, top: 0, width: 64, height: 64 },
  { left: 70, top: 0, width: 64, height: 64 },
  { left: 140, top: 0, width: 64, height: 64 },
]

describe('nearestIndex', () => {
  it('returns the tile nearest the point', () => {
    expect(nearestIndex(rects, 32, 32)).toBe(0)
    expect(nearestIndex(rects, 100, 32)).toBe(1)
    expect(nearestIndex(rects, 200, 32)).toBe(2)
  })

  it('handles a point past the end and before the start', () => {
    expect(nearestIndex(rects, -500, 0)).toBe(0)
    expect(nearestIndex(rects, 5000, 0)).toBe(2)
  })

  it('returns null for an empty list', () => {
    expect(nearestIndex([], 10, 10)).toBeNull()
  })
})
