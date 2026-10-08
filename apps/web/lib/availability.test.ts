import { describe, it, expect } from 'vitest'
import {
  addWindow,
  autoComplement,
  availabilityMeta,
  availabilityState,
  canWorkerEditDate,
  conflictsWithShift,
  DEFAULT_AVAILABILITY_PRESETS,
  describeSeriesEnd,
  describeWindows,
  entryWindows,
  formatWindow,
  fromMinutes,
  initialStatus,
  isCasual,
  isDateLocked,
  isPastDate,
  isQuarterTime,
  isValidAvailabilityTime,
  isValidWindowEnd,
  minutesOfTime,
  needsApproval,
  normaliseWindows,
  occurrencesForRepeat,
  presetWindow,
  quarterHourEndOptions,
  quarterHourOptions,
  removeWindow,
  repeatWeekly,
  resolveAvailabilityPresets,
  seriesEndDateKey,
  SERIES_HORIZON_WEEKS,
  snapWindow,
  statusMeta,
  summariseSeries,
  weeksForSeries,
  windowsArePartition,
  windowsOverlap,
  type AvailabilityEntry,
  type AvailabilityWindow,
} from '@/lib/availability'

const w = (type: 'AVAILABLE' | 'UNAVAILABLE', startTime: string, endTime: string): AvailabilityWindow =>
  ({ type, startTime, endTime })

function entry(over: Partial<AvailabilityEntry> = {}): AvailabilityEntry {
  return {
    date: '2026-10-15',
    type: 'UNAVAILABLE',
    isAllDay: true,
    startTime: null,
    endTime: null,
    windows: [],
    status: 'APPROVED',
    timeOff: false,
    notes: null,
    reason: null,
    reviewNote: null,
    seriesId: null,
    seriesEndDate: null,
    ...over,
  }
}

describe('isCasual', () => {
  it('detects casual regardless of case', () => {
    expect(isCasual('CASUAL')).toBe(true)
    expect(isCasual('casual')).toBe(true)
    expect(isCasual('CASUAL ')).toBe(true)
    expect(isCasual('PART_TIME')).toBe(false)
    expect(isCasual(null)).toBe(false)
    expect(isCasual(undefined)).toBe(false)
  })
})

describe('availabilityState', () => {
  it('maps an absent entry to DEFAULT', () => {
    expect(availabilityState(undefined)).toBe('DEFAULT')
    expect(availabilityState(null)).toBe('DEFAULT')
  })

  it('passes an all-day entry through, treating PREFERRED as AVAILABLE', () => {
    expect(availabilityState({ type: 'UNAVAILABLE', isAllDay: true })).toBe('UNAVAILABLE')
    expect(availabilityState({ type: 'AVAILABLE', isAllDay: true })).toBe('AVAILABLE')
    expect(availabilityState({ type: 'PREFERRED', isAllDay: true })).toBe('AVAILABLE')
  })

  it('maps windowed entries by dominance', () => {
    expect(availabilityState({ isAllDay: false, windows: [w('AVAILABLE', '07:00', '15:00')] })).toBe('AVAILABLE')
    expect(availabilityState({ isAllDay: false, windows: [w('AVAILABLE', '07:00', '15:00'), w('UNAVAILABLE', '15:00', '24:00')] })).toBe('UNAVAILABLE')
    expect(availabilityState({ isAllDay: false, windows: [] })).toBe('DEFAULT')
  })

  it('a DECLINED request is not in force', () => {
    expect(availabilityState({ type: 'UNAVAILABLE', isAllDay: true, status: 'DECLINED' })).toBe('DEFAULT')
  })
})

describe('entryWindows', () => {
  it('reads explicit windows', () => {
    expect(entryWindows({ isAllDay: false, windows: [w('AVAILABLE', '07:00', '15:00')] }))
      .toEqual([w('AVAILABLE', '07:00', '15:00')])
  })

  it('falls back to the legacy single window and treats PREFERRED as AVAILABLE', () => {
    expect(entryWindows({ type: 'PREFERRED', isAllDay: false, startTime: '17:00', endTime: '22:00' }))
      .toEqual([w('AVAILABLE', '17:00', '22:00')])
    expect(entryWindows({ type: 'UNAVAILABLE', isAllDay: false, startTime: '12:00', endTime: '14:00' }))
      .toEqual([w('UNAVAILABLE', '12:00', '14:00')])
  })

  it('snaps off-grid legacy minutes instead of dropping them', () => {
    expect(entryWindows({ type: 'UNAVAILABLE', isAllDay: false, startTime: '12:10', endTime: '13:50' }))
      .toEqual([w('UNAVAILABLE', '12:00', '14:00')])
  })

  it('an all-day entry has no windows', () => {
    expect(entryWindows({ isAllDay: true })).toEqual([])
  })
})

describe('snapWindow', () => {
  it('rounds start down and end up to the grid', () => {
    expect(snapWindow(w('AVAILABLE', '07:10', '15:05'))).toEqual(w('AVAILABLE', '07:00', '15:15'))
  })

  it('returns null for an empty window', () => {
    expect(snapWindow(w('AVAILABLE', '12:00', '12:00'))).toBeNull()
  })
})

describe('availabilityMeta / statusMeta', () => {
  it('colours unavailable red and available green', () => {
    expect(availabilityMeta('UNAVAILABLE', 'CASUAL').badge).toContain('danger')
    expect(availabilityMeta('AVAILABLE', 'CASUAL').badge).toContain('success')
  })

  it('flags a casual default as an UNSET warning, but a FT default as fine', () => {
    const casual = availabilityMeta('DEFAULT', 'CASUAL')
    expect(casual.label).toBe('UNSET')
    expect(casual.badge).toContain('warning')

    const ft = availabilityMeta('DEFAULT', 'FULL_TIME')
    expect(ft.label).toBe('AVAILABLE')
    expect(ft.badge).not.toContain('warning')
  })

  it('labels the three approval statuses', () => {
    expect(statusMeta('PENDING').label).toBe('PENDING')
    expect(statusMeta('APPROVED').badge).toContain('success')
    expect(statusMeta('DECLINED').badge).toContain('danger')
  })
})

describe('needsApproval / initialStatus', () => {
  it('auto-approves pure available days', () => {
    expect(needsApproval({ type: 'AVAILABLE', isAllDay: true, windows: [], timeOff: false })).toBe(false)
    expect(initialStatus({ type: 'AVAILABLE', isAllDay: true, windows: [], timeOff: false })).toBe('APPROVED')
  })

  it('sends unavailability and time off to PENDING', () => {
    expect(initialStatus({ type: 'UNAVAILABLE', isAllDay: true, windows: [], timeOff: false })).toBe('PENDING')
    expect(initialStatus({ type: 'AVAILABLE', isAllDay: true, windows: [], timeOff: true })).toBe('PENDING')
    expect(initialStatus({
      type: 'AVAILABLE',
      isAllDay: false,
      windows: [w('AVAILABLE', '07:00', '15:00'), w('UNAVAILABLE', '15:00', '24:00')],
      timeOff: false,
    })).toBe('PENDING')
  })
})

describe('time helpers', () => {
  it('parses HH:mm (and 24:00) to minutes', () => {
    expect(minutesOfTime('00:00')).toBe(0)
    expect(minutesOfTime('09:30')).toBe(570)
    expect(minutesOfTime('23:59')).toBe(1439)
    expect(minutesOfTime('24:00')).toBe(1440)
  })

  it('formats minutes back to HH:mm', () => {
    expect(fromMinutes(0)).toBe('00:00')
    expect(fromMinutes(570)).toBe('09:30')
    expect(fromMinutes(1440)).toBe('24:00')
  })

  it('validates the legacy HH:mm shape unchanged', () => {
    expect(isValidAvailabilityTime('09:00')).toBe(true)
    expect(isValidAvailabilityTime('23:59')).toBe(true)
    expect(isValidAvailabilityTime('24:00')).toBe(false)
    expect(isValidAvailabilityTime('9:00')).toBe(false)
  })

  it('validates 15-minute starts and ends', () => {
    expect(isQuarterTime('09:15')).toBe(true)
    expect(isQuarterTime('09:10')).toBe(false)
    expect(isQuarterTime('24:00')).toBe(false)
    expect(isValidWindowEnd('24:00')).toBe(true)
    expect(isValidWindowEnd('09:15')).toBe(true)
    expect(isValidWindowEnd('09:10')).toBe(false)
  })

  it('builds the option grids', () => {
    const starts = quarterHourOptions()
    expect(starts[0]).toBe('00:00')
    expect(starts[starts.length - 1]).toBe('23:45')
    expect(starts).toHaveLength(96)
    const ends = quarterHourEndOptions()
    expect(ends[0]).toBe('00:15')
    expect(ends[ends.length - 1]).toBe('24:00')
  })

  it('detects overlaps', () => {
    expect(windowsOverlap(w('AVAILABLE', '09:00', '12:00'), w('UNAVAILABLE', '11:00', '13:00'))).toBe(true)
    expect(windowsOverlap(w('AVAILABLE', '09:00', '12:00'), w('UNAVAILABLE', '12:00', '13:00'))).toBe(false)
  })
})

describe('normaliseWindows', () => {
  it('drops invalid rows and sorts by start', () => {
    expect(normaliseWindows([
      { type: 'NOPE', startTime: '09:00', endTime: '10:00' },
      { type: 'AVAILABLE', startTime: '15:00', endTime: '17:00' },
      { type: 'UNAVAILABLE', startTime: '07:00', endTime: '09:00' },
      { type: 'AVAILABLE', startTime: '09:10', endTime: '10:00' },
      { type: 'AVAILABLE', startTime: '10:00', endTime: '09:00' },
    ])).toEqual([w('UNAVAILABLE', '07:00', '09:00'), w('AVAILABLE', '15:00', '17:00')])
  })

  it('merges adjacent same-type windows', () => {
    expect(normaliseWindows([w('AVAILABLE', '07:00', '12:00'), w('AVAILABLE', '12:00', '15:00')]))
      .toEqual([w('AVAILABLE', '07:00', '15:00')])
  })

  it('an overlap keeps the earlier start and clips the later window', () => {
    expect(normaliseWindows([w('UNAVAILABLE', '00:00', '08:00'), w('AVAILABLE', '07:00', '12:00')]))
      .toEqual([w('UNAVAILABLE', '00:00', '08:00'), w('AVAILABLE', '08:00', '12:00')])
  })

  it('handles empty and non-array input', () => {
    expect(normaliseWindows(null)).toEqual([])
    expect(normaliseWindows([])).toEqual([])
  })
})

describe('autoComplement', () => {
  it('fills the gaps around available windows with UNAVAILABLE', () => {
    expect(autoComplement([w('AVAILABLE', '07:00', '15:00')])).toEqual([
      w('UNAVAILABLE', '00:00', '07:00'),
      w('AVAILABLE', '07:00', '15:00'),
      w('UNAVAILABLE', '15:00', '24:00'),
    ])
  })

  it('fills gaps between several available windows', () => {
    expect(autoComplement([w('AVAILABLE', '07:00', '12:00'), w('AVAILABLE', '14:00', '22:00')])).toEqual([
      w('UNAVAILABLE', '00:00', '07:00'),
      w('AVAILABLE', '07:00', '12:00'),
      w('UNAVAILABLE', '12:00', '14:00'),
      w('AVAILABLE', '14:00', '22:00'),
      w('UNAVAILABLE', '22:00', '24:00'),
    ])
  })

  it('leaves unavailable-only days as partial block-outs', () => {
    expect(autoComplement([w('UNAVAILABLE', '12:00', '14:00')]))
      .toEqual([w('UNAVAILABLE', '12:00', '14:00')])
  })

  it('keeps an explicit unavailable hole inside an available day', () => {
    const windows = [w('UNAVAILABLE', '00:00', '07:00'), w('AVAILABLE', '07:00', '12:00'), w('UNAVAILABLE', '12:00', '14:00'), w('AVAILABLE', '14:00', '24:00')]
    expect(autoComplement(windows)).toEqual(windows)
  })
})

describe('addWindow / removeWindow', () => {
  it('adds a preset and complements the rest of the day', () => {
    expect(addWindow([], w('AVAILABLE', '07:00', '12:00'))).toEqual([
      w('UNAVAILABLE', '00:00', '07:00'),
      w('AVAILABLE', '07:00', '12:00'),
      w('UNAVAILABLE', '12:00', '24:00'),
    ])
  })

  it('the new window wins an overlap with an existing one', () => {
    expect(addWindow([w('UNAVAILABLE', '00:00', '08:00')], w('AVAILABLE', '07:00', '12:00'))).toEqual([
      w('UNAVAILABLE', '00:00', '07:00'),
      w('AVAILABLE', '07:00', '12:00'),
      w('UNAVAILABLE', '12:00', '24:00'),
    ])
  })

  it('removes a window and normalises the rest', () => {
    expect(removeWindow([
      w('UNAVAILABLE', '00:00', '07:00'),
      w('AVAILABLE', '07:00', '12:00'),
      w('UNAVAILABLE', '12:00', '24:00'),
    ], 2)).toEqual([
      w('UNAVAILABLE', '00:00', '07:00'),
      w('AVAILABLE', '07:00', '12:00'),
    ])
  })

  it('identifies a full partition', () => {
    expect(windowsArePartition([w('UNAVAILABLE', '12:00', '14:00')])).toBe(false)
    expect(windowsArePartition([w('AVAILABLE', '12:00', '14:00')])).toBe(true)
  })
})

describe('describeWindows / formatWindow', () => {
  it('formats a single window', () => {
    expect(formatWindow(w('AVAILABLE', '07:00', '15:00'))).toBe('07:00–15:00')
  })

  it('summarises all-day and multi-window days', () => {
    expect(describeWindows([], true, 'AVAILABLE')).toBe('ALL DAY')
    expect(describeWindows([w('AVAILABLE', '07:00', '15:00')], false, 'AVAILABLE')).toBe('07:00–15:00')
    expect(describeWindows([w('AVAILABLE', '07:00', '12:00'), w('UNAVAILABLE', '12:00', '24:00')], false, 'UNAVAILABLE'))
      .toBe('07:00–12:00 +1')
  })
})

describe('conflictsWithShift', () => {
  it('an all-day unavailable blocks the whole day', () => {
    expect(conflictsWithShift(entry({ isAllDay: true, type: 'UNAVAILABLE' }), '09:00', '17:00')).toBe(true)
  })

  it('a windowed block conflicts only on overlap', () => {
    const block = entry({ isAllDay: false, windows: [w('UNAVAILABLE', '12:00', '15:00')] })
    expect(conflictsWithShift(block, '09:00', '13:00')).toBe(true)
    expect(conflictsWithShift(block, '08:00', '12:00')).toBe(false)
    expect(conflictsWithShift(block, '15:00', '20:00')).toBe(false)
  })

  it('available and declined entries never block a shift', () => {
    expect(conflictsWithShift(entry({ type: 'AVAILABLE', isAllDay: true }), '09:00', '17:00')).toBe(false)
    expect(conflictsWithShift(entry({ type: 'UNAVAILABLE', isAllDay: true, status: 'DECLINED' }), '09:00', '17:00')).toBe(false)
    expect(conflictsWithShift(undefined, '09:00', '17:00')).toBe(false)
  })

  it('legacy single-window entries still conflict', () => {
    const legacy = { type: 'UNAVAILABLE' as const, isAllDay: false, startTime: '12:00', endTime: '15:00' }
    expect(conflictsWithShift(legacy, '14:00', '18:00')).toBe(true)
  })
})

describe('date locks', () => {
  const today = '2026-10-01'

  it('flags past dates', () => {
    expect(isPastDate('2026-09-30', today)).toBe(true)
    expect(isPastDate('2026-10-01', today)).toBe(false)
  })

  it('blocks workers from past days whatever the lock', () => {
    expect(canWorkerEditDate('2026-09-30', 0, today)).toBe(false)
    expect(canWorkerEditDate('2026-10-01', 0, today)).toBe(true)
    expect(canWorkerEditDate('2026-10-05', 7, today)).toBe(false)
    expect(canWorkerEditDate('2026-10-08', 7, today)).toBe(true)
  })

  it('never locks when lockDays is 0 or unset', () => {
    expect(isDateLocked('2026-10-20', 0, today)).toBe(false)
    expect(isDateLocked('2026-10-20', -3, today)).toBe(false)
  })
})

describe('weekly series', () => {
  it('returns the start day when asked for a single occurrence', () => {
    expect(repeatWeekly('2026-10-06', 1)).toEqual(['2026-10-06'])
  })

  it('steps in 7-day jumps and crosses month boundaries', () => {
    expect(repeatWeekly('2026-10-27', 2)).toEqual(['2026-10-27', '2026-11-03'])
  })

  it('clamps a nonsense count to one', () => {
    expect(repeatWeekly('2026-10-06', 0)).toEqual(['2026-10-06'])
    expect(repeatWeekly('2026-10-06', -5)).toEqual(['2026-10-06'])
    expect(repeatWeekly('2026-10-06', 2.9)).toEqual(['2026-10-06', '2026-10-13'])
  })

  it('computes the series end date', () => {
    expect(seriesEndDateKey('2026-10-06', 2)).toBe('2026-10-13')
    expect(seriesEndDateKey('2026-10-06', 3)).toBe('2026-10-20')
  })

  it('counts weeks between two dates', () => {
    expect(weeksForSeries('2026-10-06', '2026-10-13')).toBe(2)
    expect(weeksForSeries('2026-10-06', '2026-10-20')).toBe(3)
    expect(weeksForSeries('2026-10-06', '2026-10-06')).toBe(1)
  })

  it('materialises a no-end repeat to the horizon', () => {
    expect(occurrencesForRepeat('2026-10-06', { noEnd: true })).toHaveLength(SERIES_HORIZON_WEEKS)
    expect(occurrencesForRepeat('2026-10-06', { weeks: 2 })).toEqual(['2026-10-06', '2026-10-13'])
  })

  it('describes the series end', () => {
    expect(describeSeriesEnd(null)).toBe('NO END DATE')
    expect(describeSeriesEnd('2026-10-22')).toBe('ENDS 22 OCT 2026')
  })

  it('summarises series dates', () => {
    expect(summariseSeries('s1', ['2026-10-20', '2026-10-06', '2026-10-13'])).toEqual({
      id: 's1',
      startDate: '2026-10-06',
      endDate: '2026-10-20',
      count: 3,
    })
  })
})

describe('venue presets', () => {
  it('returns the defaults for missing or invalid input', () => {
    expect(resolveAvailabilityPresets(null)).toEqual(DEFAULT_AVAILABILITY_PRESETS)
    expect(resolveAvailabilityPresets([{ key: 'MORNING', startTime: 'nope', endTime: '12:00' }]))
      .toEqual(DEFAULT_AVAILABILITY_PRESETS)
  })

  it('applies valid overrides and keeps the labels', () => {
    const out = resolveAvailabilityPresets([
      { key: 'MORNING', startTime: '06:15', endTime: '11:45' },
      { key: 'EVENING', startTime: '18:00', endTime: '24:00' },
    ])
    expect(out.find((p) => p.key === 'MORNING')).toEqual({ key: 'MORNING', label: 'MORNING', startTime: '06:15', endTime: '11:45' })
    expect(out.find((p) => p.key === 'EVENING')).toEqual({ key: 'EVENING', label: 'EVENING', startTime: '18:00', endTime: '24:00' })
    expect(out.find((p) => p.key === 'AFTERNOON')).toEqual(DEFAULT_AVAILABILITY_PRESETS[1])
  })

  it('turns a preset into an available window', () => {
    expect(presetWindow({ key: 'MORNING', label: 'MORNING', startTime: '07:00', endTime: '12:00' }))
      .toEqual({ type: 'AVAILABLE', startTime: '07:00', endTime: '12:00' })
  })
})
