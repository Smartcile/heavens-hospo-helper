import { describe, it, expect } from 'vitest'
import { resolveStaffRate } from './staff-rate'

describe('resolveStaffRate', () => {
  it('prefers the per-role override', () => {
    expect(resolveStaffRate({ staffPositionRate: 32, positionRate: 30, staffRate: 25 })).toBe(32)
  })

  it('falls back to the role default', () => {
    expect(resolveStaffRate({ staffPositionRate: null, positionRate: 30, staffRate: 25 })).toBe(30)
  })

  it('falls back to the staff base rate', () => {
    expect(resolveStaffRate({ positionRate: null, staffRate: 25 })).toBe(25)
  })

  it('returns null when no layer has a rate', () => {
    expect(resolveStaffRate({})).toBeNull()
    expect(resolveStaffRate({ staffPositionRate: null, positionRate: null, staffRate: null })).toBeNull()
  })

  it('ignores non-finite values', () => {
    expect(resolveStaffRate({ staffPositionRate: Number.NaN, positionRate: 30 })).toBe(30)
    expect(resolveStaffRate({ staffRate: Infinity })).toBeNull()
  })
})
