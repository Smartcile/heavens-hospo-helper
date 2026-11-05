import { describe, it, expect } from 'vitest'
import {
  dayKey,
  weekdayOf,
  isActivatedOn,
  isScheduleOpen,
  isChecklistOpen,
  isChecklistHidden,
  describeNextOpen,
  validateSchedules,
} from '@/lib/checklist-activation'

const day = new Date('2026-10-02T00:00:00.000Z') // Friday
const thursday = new Date('2026-10-22T00:00:00.000Z')
const THU = 4
const FRI = 5

describe('checklist-activation', () => {
  it('dayKey reduces a date to its calendar day', () => {
    expect(dayKey(new Date('2026-10-02T15:30:00.000Z'))).toBe('2026-10-02')
  })

  it('weekdayOf uses the venue-local anchored date', () => {
    expect(weekdayOf(thursday)).toBe(THU)
    expect(weekdayOf('2026-10-22')).toBe(THU)
  })

  it('isActivatedOn only matches the same venue-day', () => {
    expect(isActivatedOn(new Date('2026-10-02T00:00:00.000Z'), day)).toBe(true)
    expect(isActivatedOn(new Date('2026-10-01T00:00:00.000Z'), day)).toBe(false)
    expect(isActivatedOn(null, day)).toBe(false)
  })

  it('a list with no appear-from time is always open', () => {
    expect(isChecklistOpen(null, null, day, '06:00')).toBe(true)
  })

  it('a future appear-from time stays hidden', () => {
    expect(isChecklistOpen('15:00', null, day, '09:00')).toBe(false)
    expect(isChecklistHidden('15:00', null, day, '09:00')).toBe(true)
  })

  it('once the appear-from time passes the list opens', () => {
    expect(isChecklistOpen('09:00', null, day, '09:00')).toBe(true)
    expect(isChecklistOpen('09:00', null, day, '12:00')).toBe(true)
  })

  it('activation overrides the time gate for that day only', () => {
    expect(isChecklistOpen('15:00', new Date('2026-10-02T00:00:00.000Z'), day, '09:00')).toBe(true)
    // Next day the same stamp no longer applies.
    expect(isChecklistOpen('15:00', new Date('2026-10-02T00:00:00.000Z'), new Date('2026-10-03T00:00:00.000Z'), '09:00')).toBe(false)
  })

  it('opens only on selected days', () => {
    const schedules = [{ dayOfWeek: THU, fromTime: '08:00', toTime: null }]
    expect(isChecklistOpen(null, null, thursday, '09:00', schedules, THU)).toBe(true)
    expect(isChecklistOpen(null, null, thursday, '09:00', schedules, FRI)).toBe(false)
    // Day-of-week can be derived from the anchored venue date.
    expect(isChecklistOpen(null, null, thursday, '09:00', schedules)).toBe(true)
  })

  it('supports multiple windows on the same day', () => {
    const schedules = [
      { dayOfWeek: THU, fromTime: '08:00', toTime: '10:00' },
      { dayOfWeek: THU, fromTime: '17:00', toTime: '19:00' },
    ]
    expect(isScheduleOpen(schedules, THU, '09:00')).toBe(true)
    expect(isScheduleOpen(schedules, THU, '12:00')).toBe(false)
    expect(isScheduleOpen(schedules, THU, '18:30')).toBe(true)
    expect(isChecklistOpen(null, null, thursday, '12:00', schedules)).toBe(false)
  })

  it('treats a null toTime as open to end of day', () => {
    const schedules = [{ dayOfWeek: THU, fromTime: '20:00', toTime: null }]
    expect(isScheduleOpen(schedules, THU, '23:59')).toBe(true)
    expect(isScheduleOpen(schedules, THU, '19:59')).toBe(false)
  })

  it('keeps the legacy behaviour when there are no schedule rows', () => {
    expect(isChecklistOpen('15:00', null, day, '09:00', [], FRI)).toBe(false)
    expect(isChecklistOpen('15:00', null, day, '16:00', [], FRI)).toBe(true)
    expect(isChecklistOpen(null, null, day, '09:00', [], FRI)).toBe(true)
  })

  it('activation overrides a closed schedule day', () => {
    const schedules = [{ dayOfWeek: THU, fromTime: '08:00', toTime: null }]
    const activated = new Date('2026-10-23T00:00:00.000Z')
    expect(isChecklistOpen(null, activated, new Date('2026-10-23T00:00:00.000Z'), '09:00', schedules, FRI)).toBe(true)
  })

  it('labels the next opening later today', () => {
    const schedules = [{ dayOfWeek: THU, fromTime: '18:00', toTime: null }]
    expect(describeNextOpen({ schedules, day: thursday, nowHHmm: '09:00', dayOfWeek: THU })).toBe('OPENS THU 18:00')
  })

  it('rolls the next opening over to the following week', () => {
    const schedules = [{ dayOfWeek: THU, fromTime: '08:00', toTime: '10:00' }]
    // Thursday, after the only window has closed.
    expect(describeNextOpen({ schedules, day: thursday, nowHHmm: '12:00', dayOfWeek: THU })).toBe('OPENS THU 08:00')
    // On a Friday the next Thursday is the following week, still labelled THU.
    expect(describeNextOpen({ schedules, day: new Date('2026-10-23T00:00:00.000Z'), nowHHmm: '12:00', dayOfWeek: FRI })).toBe('OPENS THU 08:00')
  })

  it('labels the next opening for a legacy appear-from list', () => {
    expect(describeNextOpen({ appearFromTime: '15:00', day, nowHHmm: '09:00', dayOfWeek: FRI })).toBe('OPENS FRI 15:00')
    expect(describeNextOpen({ appearFromTime: '08:00', day, nowHHmm: '09:00', dayOfWeek: FRI })).toBeNull()
  })

  it('validates a schedules payload', () => {
    expect(validateSchedules(undefined)).toEqual({ ok: true, schedules: [] })
    expect(validateSchedules([
      { dayOfWeek: 1, fromTime: '08:00' },
      { dayOfWeek: 6, fromTime: '17:00', toTime: '22:00' },
    ])).toEqual({
      ok: true,
      schedules: [
        { dayOfWeek: 1, fromTime: '08:00', toTime: null },
        { dayOfWeek: 6, fromTime: '17:00', toTime: '22:00' },
      ],
    })
    expect(validateSchedules([{ dayOfWeek: 7, fromTime: '08:00' }]).ok).toBe(false)
    expect(validateSchedules([{ dayOfWeek: 1, fromTime: '25:00' }]).ok).toBe(false)
    expect(validateSchedules([{ dayOfWeek: 1, fromTime: '08:00', toTime: '8:00' }]).ok).toBe(false)
  })
})
