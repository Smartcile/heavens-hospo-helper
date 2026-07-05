import { describe, it, expect } from 'vitest'
import { nzBreakEntitlement, shiftHours, formatBreaks } from '@/lib/breaks'

describe('nzBreakEntitlement', () => {
  it('2–4h: 1 rest, 0 meal', () => {
    expect(nzBreakEntitlement(2.5)).toEqual({ rest10: 1, meal30: 0 })
    expect(nzBreakEntitlement(4)).toEqual({ rest10: 1, meal30: 0 })
  })

  it('4–6h: 1 rest, 1 meal', () => {
    expect(nzBreakEntitlement(4.5)).toEqual({ rest10: 1, meal30: 1 })
    expect(nzBreakEntitlement(6)).toEqual({ rest10: 1, meal30: 1 })
  })

  it('6–8h: 2 rest, 1 meal', () => {
    expect(nzBreakEntitlement(6.5)).toEqual({ rest10: 2, meal30: 1 })
    expect(nzBreakEntitlement(8)).toEqual({ rest10: 2, meal30: 1 })
  })

  it('over 8h: repeats per 8h block', () => {
    expect(nzBreakEntitlement(9)).toEqual({ rest10: 2, meal30: 1 })
    expect(nzBreakEntitlement(16)).toEqual({ rest10: 4, meal30: 2 })
    expect(nzBreakEntitlement(17)).toEqual({ rest10: 4, meal30: 2 })
  })

  it('under 2h: no breaks', () => {
    expect(nzBreakEntitlement(1)).toEqual({ rest10: 0, meal30: 0 })
  })

  it('zero hours', () => {
    expect(nzBreakEntitlement(0)).toEqual({ rest10: 0, meal30: 0 })
  })
})

describe('shiftHours', () => {
  it('computes simple shift length', () => {
    expect(shiftHours('09:00', '17:00')).toBe(8)
  })

  it('handles shifts crossing midnight', () => {
    expect(shiftHours('22:00', '02:00')).toBe(4)
  })

  it('handles partial hours', () => {
    expect(shiftHours('09:30', '17:00')).toBe(7.5)
  })

  it('handles same time (zero shift)', () => {
    expect(shiftHours('09:00', '09:00')).toBe(0)
  })
})

describe('formatBreaks', () => {
  it('formats a typical 8h shift', () => {
    expect(formatBreaks('09:00', '17:00')).toBe('2×10min + 1×30min')
  })

  it('formats a short shift with no meal', () => {
    expect(formatBreaks('09:00', '12:00')).toBe('1×10min')
  })

  it('returns "No breaks" for very short shift', () => {
    expect(formatBreaks('09:00', '10:00')).toBe('No breaks')
  })
})
