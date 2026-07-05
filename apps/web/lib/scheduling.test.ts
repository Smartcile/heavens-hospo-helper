import { describe, it, expect } from 'vitest'
import { describeSchedule, isTaskDueOnDate, formatDateKey, MONTHLY_OPTIONS } from '@/lib/scheduling'
import type { SchedulableTask } from '@/lib/scheduling'

function task(overrides: Partial<SchedulableTask> = {}): SchedulableTask {
  return {
    scheduleType: 'DAILY',
    scheduleDays: [],
    customCron: null,
    ...overrides,
  }
}

describe('formatDateKey', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(formatDateKey(new Date('2026-07-05'))).toBe('2026-07-05')
  })

  it('pads single-digit month and day', () => {
    expect(formatDateKey(new Date('2026-01-01'))).toBe('2026-01-01')
  })

  it('handles year boundary', () => {
    expect(formatDateKey(new Date('2025-12-31'))).toBe('2025-12-31')
  })
})

describe('describeSchedule', () => {
  it('returns DAILY for daily tasks', () => {
    expect(describeSchedule(task())).toBe('DAILY')
  })

  it('returns sorted days for weekly tasks', () => {
    expect(describeSchedule(task({ scheduleType: 'WEEKLY', scheduleDays: [1, 3, 5] }))).toBe('MON, WED, FRI')
  })

  it('handles single weekly day', () => {
    expect(describeSchedule(task({ scheduleType: 'WEEKLY', scheduleDays: [1] }))).toBe('MON')
  })

  it('returns CUSTOM for custom cron', () => {
    expect(describeSchedule(task({ scheduleType: 'CUSTOM' }))).toBe('CUSTOM')
  })

  it('returns monthly option description', () => {
    const t = task({ scheduleType: 'MONTHLY', monthlyOption: 'LAST_DAY' })
    expect(describeSchedule(t)).toBe('END OF MONTH')
  })

  it('includes interval for multi-month', () => {
    const t = task({ scheduleType: 'MONTHLY', monthlyOption: 'FIRST_DAY', intervalMonths: 3 })
    expect(describeSchedule(t)).toBe('EVERY 3 MONTHS · START OF MONTH')
  })

  it('shows specific day', () => {
    const t = task({ scheduleType: 'MONTHLY', monthlyOption: 'SPECIFIC_DAY', monthlyDay: 10 })
    expect(describeSchedule(t)).toBe('DAY 10')
  })
})

describe('MONTHLY_OPTIONS', () => {
  it('has 8 options', () => {
    expect(MONTHLY_OPTIONS).toHaveLength(8)
  })
})

describe('isTaskDueOnDate', () => {
  it('DAILY is always due', () => {
    expect(isTaskDueOnDate(task(), new Date('2026-01-01'))).toBe(true)
  })

  it('WEEKLY matches day of week', () => {
    const sun = new Date('2026-07-05') // Sunday = 0
    const mon = new Date('2026-07-06') // Monday = 1
    const t = task({ scheduleType: 'WEEKLY', scheduleDays: [1] })
    expect(isTaskDueOnDate(t, sun)).toBe(false)
    expect(isTaskDueOnDate(t, mon)).toBe(true)
  })

  it('MONTHLY FIRST_DAY matches day 1', () => {
    const t = task({ scheduleType: 'MONTHLY', monthlyOption: 'FIRST_DAY' })
    expect(isTaskDueOnDate(t, new Date('2026-07-01'))).toBe(true)
    expect(isTaskDueOnDate(t, new Date('2026-07-02'))).toBe(false)
  })

  it('MONTHLY LAST_DAY matches last day', () => {
    const t = task({ scheduleType: 'MONTHLY', monthlyOption: 'LAST_DAY' })
    expect(isTaskDueOnDate(t, new Date('2026-07-31'))).toBe(true)
    expect(isTaskDueOnDate(t, new Date('2026-07-30'))).toBe(false)
  })

  it('MONTHLY with interval respects cadence', () => {
    const t = task({
      scheduleType: 'MONTHLY',
      monthlyOption: 'FIRST_DAY',
      intervalMonths: 2,
      createdAt: new Date('2026-01-01'),
    })
    expect(isTaskDueOnDate(t, new Date('2026-01-01'))).toBe(true)
    expect(isTaskDueOnDate(t, new Date('2026-02-01'))).toBe(false)
    expect(isTaskDueOnDate(t, new Date('2026-03-01'))).toBe(true)
  })

  it('CUSTOM returns false for invalid cron', () => {
    const t = task({ scheduleType: 'CUSTOM', customCron: 'invalid' })
    expect(isTaskDueOnDate(t, new Date('2026-07-01'))).toBe(false)
  })

  it('CUSTOM matches cron expression', () => {
    const t = task({ scheduleType: 'CUSTOM', customCron: '0 0 1 * *' })
    expect(isTaskDueOnDate(t, new Date('2026-07-01'))).toBe(true)
    expect(isTaskDueOnDate(t, new Date('2026-07-02'))).toBe(false)
  })

  it('unknown scheduleType returns false', () => {
    const t = task({ scheduleType: 'UNKNOWN' as any })
    expect(isTaskDueOnDate(t, new Date('2026-01-01'))).toBe(false)
  })
})
