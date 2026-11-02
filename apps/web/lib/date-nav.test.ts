import { describe, it, expect } from 'vitest'
import {
  ordinal,
  formatDateLong,
  formatDateRange,
  formatDateShort,
  firstOfMonthKey,
  endOfMonthKey,
  shiftDay,
  mondayOf,
  shiftMonth,
  monthGrid,
  weekKeys,
} from '@/lib/date-nav'

describe('ordinal', () => {
  it('handles 1st/2nd/3rd and the -teen exceptions', () => {
    expect(ordinal(1)).toBe('1ST')
    expect(ordinal(2)).toBe('2ND')
    expect(ordinal(3)).toBe('3RD')
    expect(ordinal(4)).toBe('4TH')
    expect(ordinal(11)).toBe('11TH')
    expect(ordinal(12)).toBe('12TH')
    expect(ordinal(13)).toBe('13TH')
    expect(ordinal(21)).toBe('21ST')
    expect(ordinal(22)).toBe('22ND')
    expect(ordinal(23)).toBe('23RD')
    expect(ordinal(31)).toBe('31ST')
  })
})

describe('formatDateLong', () => {
  it('formats as DAY, DTH MONTH YYYY in uppercase', () => {
    expect(formatDateLong('2026-08-09')).toBe('SUNDAY, 9TH AUGUST 2026')
    expect(formatDateLong('2026-08-14')).toBe('FRIDAY, 14TH AUGUST 2026')
    expect(formatDateLong('2025-01-01')).toBe('WEDNESDAY, 1ST JANUARY 2025')
  })
})

describe('formatDateShort', () => {
  it('formats as MON D, YYYY in uppercase', () => {
    expect(formatDateShort('2026-08-09')).toBe('AUG 9, 2026')
    expect(formatDateShort('2026-08-14')).toBe('AUG 14, 2026')
    expect(formatDateShort('2025-01-01')).toBe('JAN 1, 2025')
    expect(formatDateShort('2026-12-25')).toBe('DEC 25, 2026')
  })
})

describe('formatDateRange', () => {
  it('renders a range within one month', () => {
    expect(formatDateRange({ start: '2026-08-10', end: '2026-08-16' })).toBe('10TH – 16TH AUGUST 2026')
  })

  it('renders a range spanning months', () => {
    expect(formatDateRange({ start: '2026-06-30', end: '2026-07-05' })).toBe('30TH JUNE – 5TH JULY 2026')
  })

  it('renders a range spanning years', () => {
    expect(formatDateRange({ start: '2026-12-28', end: '2027-01-03' })).toBe(
      '28TH DECEMBER 2026 – 3RD JANUARY 2027',
    )
  })

  it('falls back to the long single-day format', () => {
    expect(formatDateRange({ start: '2026-08-09', end: '2026-08-09' })).toBe('SUNDAY, 9TH AUGUST 2026')
  })
})

describe('firstOfMonthKey / endOfMonthKey', () => {
  it('computes the month boundaries of the key', () => {
    expect(firstOfMonthKey('2026-08-09')).toBe('2026-08-01')
    expect(endOfMonthKey('2026-08-09')).toBe('2026-08-31')
    expect(endOfMonthKey('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonthKey('2028-02-10')).toBe('2028-02-29')
  })
})

describe('shiftDay', () => {
  it('moves across day/month/year boundaries', () => {
    expect(shiftDay('2026-08-09', 1)).toBe('2026-08-10')
    expect(shiftDay('2026-08-09', -7)).toBe('2026-08-02')
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDay('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('mondayOf', () => {
  it('returns the Monday of the week containing the key', () => {
    expect(mondayOf('2026-08-09')).toBe('2026-08-03')
    expect(mondayOf('2026-08-03')).toBe('2026-08-03')
    expect(mondayOf('2026-08-14')).toBe('2026-08-10')
  })
})

describe('shiftMonth', () => {
  it('wraps year boundaries', () => {
    expect(shiftMonth(2026, 8, 1)).toEqual({ year: 2026, month: 9 })
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth(2026, 8, -3)).toEqual({ year: 2026, month: 5 })
  })
})

describe('monthGrid', () => {
  it('starts on the correct Monday-first offset and covers the month', () => {
    const g = monthGrid(2026, 8)
    expect(g.length % 7).toBe(0)
    const lead = g.findIndex((c) => c.inMonth)
    expect(lead).toBe(5) // 1 Aug 2026 is a Saturday
    expect(g.filter((c) => c.inMonth)).toHaveLength(31)
    expect(g[lead].key).toBe('2026-08-01')
    expect(g.filter((c) => c.inMonth).at(-1)!.key).toBe('2026-08-31')
  })
})

describe('weekKeys', () => {
  it('returns Monday–Sunday keys', () => {
    expect(weekKeys('2026-08-14')).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ])
  })
})
