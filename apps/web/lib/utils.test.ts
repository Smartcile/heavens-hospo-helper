import { describe, it, expect } from 'vitest'
import { toUpperCase, formatDate, formatTime, formatDateTime, getTodayDate, clamp, completionPercent, cn } from '@/lib/utils'

describe('toUpperCase', () => {
  it('converts to uppercase', () => {
    expect(toUpperCase('hello')).toBe('HELLO')
  })
})

describe('formatDate', () => {
  it('formats a date in en-NZ locale', () => {
    const result = formatDate(new Date('2026-07-05'))
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})

describe('formatTime', () => {
  it('formats a time in en-NZ locale', () => {
    const result = formatTime(new Date('2026-07-05T14:30:00'))
    expect(result).toContain(':')
  })
})

describe('formatDateTime', () => {
  it('combines date and time', () => {
    const result = formatDateTime(new Date('2026-07-05T14:30:00'))
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(result).toContain(' ')
  })
})

describe('getTodayDate', () => {
  it('returns a Date for today without timezone', () => {
    const today = getTodayDate()
    expect(today).toBeInstanceOf(Date)
  })

  it('returns a Date for today with a valid timezone', () => {
    const today = getTodayDate('Pacific/Auckland')
    expect(today).toBeInstanceOf(Date)
  })
})

describe('clamp', () => {
  it('returns value when within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('returns min when value is below', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
  })

  it('returns max when value is above', () => {
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('returns min=0 when both min and value are 0', () => {
    expect(clamp(0, 0, 10)).toBe(0)
  })
})

describe('completionPercent', () => {
  it('returns 0 when total is 0', () => {
    expect(completionPercent(5, 0)).toBe(0)
  })

  it('returns 50 for half completion', () => {
    expect(completionPercent(1, 2)).toBe(50)
  })

  it('returns 100 for full completion', () => {
    expect(completionPercent(5, 5)).toBe(100)
  })
})

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('filters out falsy values', () => {
    expect(cn('a', undefined, null, false, 'b')).toBe('a b')
  })

  it('returns empty string for all falsy', () => {
    expect(cn(null, undefined, false)).toBe('')
  })
})
