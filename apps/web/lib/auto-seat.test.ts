import { describe, it, expect } from 'vitest'
import { planAutoSeat, type AutoSeatProfile } from './auto-seat'

const round8: AutoSeatProfile = { id: 'r8', capacity: 8, chairCount: 8, width: 150, depth: 150 }
const square4: AutoSeatProfile = { id: 's4', capacity: 4, chairCount: 4, width: 80, depth: 80 }

describe('planAutoSeat', () => {
  it('covers party size with largest-first exact fit', () => {
    const r = planAutoSeat(16, [round8, square4])
    expect(r).toHaveLength(2)
    expect(r.every(p => p.profileId === 'r8')).toBe(true)
  })

  it('overfills with a smaller table when remainder is left', () => {
    const r = planAutoSeat(10, [round8, square4]) // one 8-top + one 4-top overfill
    expect(r).toHaveLength(2)
    expect(r[0].profileId).toBe('r8')
    expect(r[1].profileId).toBe('s4')
  })

  it('returns empty for non-positive party size or no profiles', () => {
    expect(planAutoSeat(0, [round8])).toEqual([])
    expect(planAutoSeat(10, [])).toEqual([])
  })

  it('lays tables out in a grid', () => {
    const r = planAutoSeat(32, [round8], { originX: 100, originY: 100, cols: 2, spacingX: 200, spacingY: 200 })
    expect(r).toHaveLength(4)
    expect(r[0]).toMatchObject({ x: 100, y: 100 })
    expect(r[1]).toMatchObject({ x: 300, y: 100 })
    expect(r[2]).toMatchObject({ x: 100, y: 300 }) // wraps to next row
    expect(r[3]).toMatchObject({ x: 300, y: 300 })
  })

  it('assigns table numbers from the pool and skips used ones', () => {
    const pooled: AutoSeatProfile = { ...round8, tableNumbers: ['20', '21', '22'] }
    const r = planAutoSeat(24, [pooled], { usedNumbers: { r8: ['20'] } })
    const nums = r.map(p => p.assignedNumber)
    expect(nums).toContain('21')
    expect(nums).toContain('22')
    expect(nums).not.toContain('20')
  })

  it('stops placing a pooled profile once its numbers are exhausted', () => {
    const pooled: AutoSeatProfile = { ...round8, tableNumbers: ['20'] }
    const r = planAutoSeat(64, [pooled]) // pool only allows one table
    expect(r).toHaveLength(1)
    expect(r[0].assignedNumber).toBe('20')
  })

  it('places pool-less profiles freely with null numbers', () => {
    const r = planAutoSeat(16, [round8])
    expect(r).toHaveLength(2)
    expect(r.every(p => p.assignedNumber === null)).toBe(true)
  })
})
