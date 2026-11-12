import { describe, it, expect } from 'vitest'
import {
  buildCopyWeekRows,
  buildTemplateWeekRows,
  dateForDayIndex,
  dayIndexFromDate,
  isDateInWeek,
  isDateKey,
  normaliseApplyMode,
  normaliseWeekToTemplate,
  type WeekShiftInput,
} from '@/lib/roster-template'

// 2026-11-09 is a Monday; 2026-11-15 is the Sunday of that week.
const MON = '2026-11-09'
const SUN = '2026-11-15'

const shift = (over: Partial<WeekShiftInput> = {}): WeekShiftInput => ({
  staffId: 'st1',
  positionId: 'p1',
  date: MON,
  startTime: '09:00',
  endTime: '17:00',
  breakMinutes: 30,
  colour: '#111111',
  tag: 'OPEN',
  note: 'NOTE',
  ...over,
})

describe('dayIndexFromDate / dateForDayIndex', () => {
  it('maps Monday to 0 and Sunday to 6', () => {
    expect(dayIndexFromDate(MON)).toBe(0)
    expect(dayIndexFromDate('2026-11-15')).toBe(6)
  })

  it('maps a day index back into a week', () => {
    expect(dateForDayIndex(MON, 0)).toBe(MON)
    expect(dateForDayIndex(MON, 6)).toBe(SUN)
  })

  it('clamps out-of-range day indexes', () => {
    expect(dateForDayIndex(MON, 9)).toBe(SUN)
    expect(dateForDayIndex(MON, -2)).toBe(MON)
  })
})

describe('isDateInWeek', () => {
  it('accepts dates inside the Monday–Sunday week only', () => {
    expect(isDateInWeek(MON, MON)).toBe(true)
    expect(isDateInWeek(SUN, MON)).toBe(true)
    expect(isDateInWeek('2026-11-16', MON)).toBe(false)
    expect(isDateInWeek('2026-11-08', MON)).toBe(false)
  })
})

describe('normaliseWeekToTemplate', () => {
  it('drops shifts outside the week and normalises to day indexes', () => {
    const rows = normaliseWeekToTemplate(
      [
        shift({ date: SUN, startTime: '10:00' }),
        shift({ date: MON, startTime: '09:00' }),
        shift({ date: '2026-11-16' }),
      ],
      MON,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].dayIndex).toBe(0)
    expect(rows[1].dayIndex).toBe(6)
    expect(rows[0].breakMinutes).toBe(30)
    expect(rows[0].sortOrder).toBe(0)
  })
})

describe('buildTemplateWeekRows', () => {
  it('maps day indexes onto the target week and skips unknown staff', () => {
    const template = normaliseWeekToTemplate(
      [shift({ staffId: 'st1', date: MON }), shift({ staffId: 'gone', date: SUN })],
      MON,
    )
    const { rows, skippedStaffIds } = buildTemplateWeekRows(template, '2026-11-30', new Set(['st1']))
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-11-30')
    expect(rows[0].staffId).toBe('st1')
    expect(skippedStaffIds).toEqual(['gone'])
  })

  it('reports a skipped staff member once even with multiple shifts', () => {
    const template = normaliseWeekToTemplate(
      [shift({ staffId: 'gone', date: MON }), shift({ staffId: 'gone', date: SUN })],
      MON,
    )
    const { rows, skippedStaffIds } = buildTemplateWeekRows(template, '2026-11-30', [])
    expect(rows).toHaveLength(0)
    expect(skippedStaffIds).toEqual(['gone'])
  })
})

describe('buildCopyWeekRows', () => {
  it('shifts source days onto the target week', () => {
    const { rows, skippedStaffIds } = buildCopyWeekRows(
      [shift({ date: MON, startTime: '07:00' }), shift({ staffId: 'st2', date: '2026-11-13', startTime: '12:00' })],
      MON,
      '2026-11-16',
      ['st1', 'st2'],
    )
    expect(rows.map((r) => r.date)).toEqual(['2026-11-16', '2026-11-20'])
    expect(skippedStaffIds).toEqual([])
  })
})

describe('normaliseApplyMode', () => {
  it('defaults to ADD and accepts REPLACE', () => {
    expect(normaliseApplyMode('REPLACE')).toBe('REPLACE')
    expect(normaliseApplyMode('add')).toBe('ADD')
    expect(normaliseApplyMode(undefined)).toBe('ADD')
  })
})

describe('isDateKey', () => {
  it('accepts real YYYY-MM-DD keys only', () => {
    expect(isDateKey('2026-11-09')).toBe(true)
    expect(isDateKey('2026-13-40')).toBe(false)
    expect(isDateKey('09/11/2026')).toBe(false)
    expect(isDateKey(null)).toBe(false)
  })
})
