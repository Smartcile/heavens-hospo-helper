import { describe, it, expect } from 'vitest'
import { monthDays, isValidTime, dateKeysBetween } from '@/lib/calendar'

describe('monthDays', () => {
  it('returns correct days for January', () => {
    const result = monthDays(2026, 1)
    expect(result.days.length).toBe(31)
    expect(result.first.getUTCDate()).toBe(1)
    expect(result.last.getUTCDate()).toBe(31)
  })

  it('returns correct days for February non-leap', () => {
    const result = monthDays(2025, 2)
    expect(result.days.length).toBe(28)
  })

  it('returns correct days for February leap year', () => {
    const result = monthDays(2024, 2)
    expect(result.days.length).toBe(29)
  })

  it('returns all dates as UTC midnight', () => {
    const result = monthDays(2026, 1)
    for (const d of result.days) {
      expect(d.getUTCHours()).toBe(0)
      expect(d.getUTCMinutes()).toBe(0)
    }
  })

  it('handles December correctly', () => {
    const result = monthDays(2026, 12)
    expect(result.days.length).toBe(31)
    expect(result.first.getUTCMonth()).toBe(11)
    expect(result.first.getUTCFullYear()).toBe(2026)
  })
})

describe('isValidTime', () => {
  it('accepts valid HH:mm times', () => {
    expect(isValidTime('00:00')).toBe(true)
    expect(isValidTime('12:30')).toBe(true)
    expect(isValidTime('23:59')).toBe(true)
  })

  it('rejects invalid formats', () => {
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('12:60')).toBe(false)
    expect(isValidTime('abc')).toBe(false)
    expect(isValidTime('')).toBe(false)
    expect(isValidTime('1230')).toBe(false)
  })

  it('rejects non-string inputs', () => {
    expect(isValidTime(null)).toBe(false)
    expect(isValidTime(undefined)).toBe(false)
    expect(isValidTime(1230)).toBe(false)
  })
})

describe('dateKeysBetween', () => {
  it('returns a single key for same day', () => {
    const d = new Date('2026-01-15')
    const keys = dateKeysBetween(d, d)
    expect(keys.length).toBe(1)
  })

  it('returns keys for a range of days', () => {
    const start = new Date('2026-01-01')
    const end = new Date('2026-01-03')
    const keys = dateKeysBetween(start, end)
    expect(keys.length).toBe(3)
  })

  it('returns keys in order', () => {
    const start = new Date('2026-01-01')
    const end = new Date('2026-01-05')
    const keys = dateKeysBetween(start, end)
    expect(keys).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
    ])
  })
})
