import { describe, it, expect } from 'vitest'
import {
  allowedTypes,
  availabilityMeta,
  availabilityState,
  availabilityTimeLabel,
  conflictsWithShift,
  isCasual,
  isDateLocked,
  isValidAvailabilityTime,
  minutesOfTime,
  repeatWeekly,
  type AvailabilityEntry,
} from '@/lib/availability'

function entry(over: Partial<AvailabilityEntry> = {}): AvailabilityEntry {
  return {
    date: '2026-10-15',
    type: 'UNAVAILABLE',
    isAllDay: true,
    startTime: null,
    endTime: null,
    notes: null,
    ...over,
  }
}

describe('isCasual / allowedTypes', () => {
  it('detects casual regardless of case', () => {
    expect(isCasual('CASUAL')).toBe(true)
    expect(isCasual('casual')).toBe(true)
    expect(isCasual('CASUAL ')).toBe(true)
    expect(isCasual('PART_TIME')).toBe(false)
    expect(isCasual(null)).toBe(false)
    expect(isCasual(undefined)).toBe(false)
  })

  it('lets casuals prefer or block, FT/PT only block', () => {
    expect(allowedTypes('CASUAL')).toEqual(['PREFERRED', 'UNAVAILABLE'])
    expect(allowedTypes('FULL_TIME')).toEqual(['UNAVAILABLE'])
    expect(allowedTypes('PART_TIME')).toEqual(['UNAVAILABLE'])
    expect(allowedTypes(null)).toEqual(['UNAVAILABLE'])
  })
})

describe('availabilityState', () => {
  it('maps an absent entry to DEFAULT', () => {
    expect(availabilityState(undefined)).toBe('DEFAULT')
    expect(availabilityState(null)).toBe('DEFAULT')
  })

  it('passes the entry type through', () => {
    expect(availabilityState(entry({ type: 'UNAVAILABLE' }))).toBe('UNAVAILABLE')
    expect(availabilityState(entry({ type: 'PREFERRED' }))).toBe('PREFERRED')
  })
})

describe('availabilityMeta', () => {
  it('colours unavailable red and preferred green', () => {
    expect(availabilityMeta('UNAVAILABLE', 'CASUAL').badge).toContain('danger')
    expect(availabilityMeta('PREFERRED', 'CASUAL').badge).toContain('success')
  })

  it('flags a casual default as an UNSET warning, but a FT default as fine', () => {
    const casual = availabilityMeta('DEFAULT', 'CASUAL')
    expect(casual.label).toBe('UNSET')
    expect(casual.badge).toContain('warning')

    const ft = availabilityMeta('DEFAULT', 'FULL_TIME')
    expect(ft.label).toBe('AVAILABLE')
    expect(ft.badge).not.toContain('warning')
  })
})

describe('time helpers', () => {
  it('parses HH:mm to minutes', () => {
    expect(minutesOfTime('00:00')).toBe(0)
    expect(minutesOfTime('09:30')).toBe(570)
    expect(minutesOfTime('23:59')).toBe(1439)
  })

  it('validates the HH:mm shape', () => {
    expect(isValidAvailabilityTime('09:00')).toBe(true)
    expect(isValidAvailabilityTime('23:59')).toBe(true)
    expect(isValidAvailabilityTime('24:00')).toBe(false)
    expect(isValidAvailabilityTime('9:00')).toBe(false)
    expect(isValidAvailabilityTime('')).toBe(false)
  })

  it('formats an entry window', () => {
    expect(availabilityTimeLabel(entry({ isAllDay: true }))).toBe('ALL DAY')
    expect(availabilityTimeLabel(entry({ isAllDay: false, startTime: '17:00', endTime: '22:00' }))).toBe('17:00–22:00')
    expect(availabilityTimeLabel(entry({ isAllDay: false, startTime: null, endTime: null }))).toBe('ALL DAY')
  })
})

describe('conflictsWithShift', () => {
  it('an all-day block always conflicts', () => {
    expect(conflictsWithShift(entry({ isAllDay: true }), '09:00', '17:00')).toBe(true)
  })

  it('a timed block conflicts only on overlap', () => {
    const block = entry({ isAllDay: false, startTime: '12:00', endTime: '15:00' })
    expect(conflictsWithShift(block, '09:00', '13:00')).toBe(true) // partial
    expect(conflictsWithShift(block, '13:00', '18:00')).toBe(true) // contains start
    expect(conflictsWithShift(block, '12:00', '15:00')).toBe(true) // exact
    expect(conflictsWithShift(block, '08:00', '12:00')).toBe(false) // touches, no overlap
    expect(conflictsWithShift(block, '15:00', '20:00')).toBe(false)
    expect(conflictsWithShift(block, '06:00', '09:00')).toBe(false)
  })

  it('preferred entries never block a shift', () => {
    expect(conflictsWithShift(entry({ type: 'PREFERRED' }), '09:00', '17:00')).toBe(false)
  })

  it('an absent entry never conflicts', () => {
    expect(conflictsWithShift(undefined, '09:00', '17:00')).toBe(false)
  })
})

describe('isDateLocked', () => {
  const today = '2026-10-01'

  it('never locks when lockDays is 0 or unset', () => {
    expect(isDateLocked('2026-09-01', 0, today)).toBe(false)
    expect(isDateLocked('2026-09-01', -3, today)).toBe(false)
    expect(isDateLocked('2026-10-20', 0, today)).toBe(false)
  })

  it('locks dates before today + lockDays', () => {
    // 7-day lock: today and the next 6 days are in, day 7+ is out.
    expect(isDateLocked('2026-10-01', 7, today)).toBe(true)
    expect(isDateLocked('2026-10-07', 7, today)).toBe(true)
    expect(isDateLocked('2026-10-08', 7, today)).toBe(false)
    expect(isDateLocked('2026-09-30', 7, today)).toBe(true)
  })
})

describe('repeatWeekly', () => {
  it('returns the start day when asked for a single occurrence', () => {
    expect(repeatWeekly('2026-10-06', 1)).toEqual(['2026-10-06'])
  })

  it('steps in 7-day jumps', () => {
    expect(repeatWeekly('2026-10-06', 3)).toEqual(['2026-10-06', '2026-10-13', '2026-10-20'])
  })

  it('crosses month boundaries', () => {
    expect(repeatWeekly('2026-10-27', 2)).toEqual(['2026-10-27', '2026-11-03'])
  })

  it('clamps a nonsense count to one', () => {
    expect(repeatWeekly('2026-10-06', 0)).toEqual(['2026-10-06'])
    expect(repeatWeekly('2026-10-06', -5)).toEqual(['2026-10-06'])
    expect(repeatWeekly('2026-10-06', 2.9)).toEqual(['2026-10-06', '2026-10-13'])
  })
})
