import { describe, it, expect } from 'vitest'
import {
  dayKey,
  weekdayOf,
  isActivatedOn,
  isScheduleOpen,
  isEventActive,
  eventWindowOnDay,
  isChecklistOpen,
  isChecklistHidden,
  describeNextOpen,
  summariseCalendarEvent,
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

  it('opens a timed event between its start and end', () => {
    const event = {
      startsAt: new Date('2026-10-22T18:00:00.000Z'),
      endsAt: new Date('2026-10-22T20:00:00.000Z'),
      allDay: false,
    }
    expect(eventWindowOnDay(event, '2026-10-22')).toEqual({ fromTime: '18:00', toTime: '20:00' })
    expect(isEventActive(event, '2026-10-22', '17:59')).toBe(false)
    expect(isEventActive(event, '2026-10-22', '18:00')).toBe(true)
    expect(isEventActive(event, '2026-10-22', '20:00')).toBe(true)
    expect(isEventActive(event, '2026-10-22', '20:01')).toBe(false)
    expect(isEventActive(event, '2026-10-23', '18:00')).toBe(false)
  })

  it('runs a timed event with no end to the end of its day', () => {
    const event = { startsAt: new Date('2026-10-22T18:00:00.000Z'), allDay: false }
    expect(eventWindowOnDay(event, '2026-10-22')).toEqual({ fromTime: '18:00', toTime: '23:59' })
    expect(isEventActive(event, '2026-10-22', '23:59')).toBe(true)
  })

  it('keeps an all-day event open for its whole date', () => {
    const event = {
      startsAt: new Date('2026-10-22T00:00:00.000Z'),
      endsAt: new Date('2026-10-23T00:00:00.000Z'),
      allDay: true,
    }
    expect(isEventActive(event, '2026-10-22', '00:00')).toBe(true)
    expect(isEventActive(event, '2026-10-22', '23:59')).toBe(true)
    // All-day DTEND is exclusive.
    expect(isEventActive(event, '2026-10-23', '09:00')).toBe(false)
  })

  it('opens a multi-day event across every date it covers', () => {
    const event = {
      startsAt: new Date('2026-10-22T18:00:00.000Z'),
      endsAt: new Date('2026-10-24T02:00:00.000Z'),
      allDay: false,
    }
    expect(isEventActive(event, '2026-10-22', '17:59')).toBe(false)
    expect(isEventActive(event, '2026-10-22', '18:00')).toBe(true)
    expect(isEventActive(event, '2026-10-23', '00:00')).toBe(true)
    expect(isEventActive(event, '2026-10-23', '23:59')).toBe(true)
    expect(isEventActive(event, '2026-10-24', '02:00')).toBe(true)
    expect(isEventActive(event, '2026-10-24', '02:01')).toBe(false)
  })

  it('treats deleted or cancelled events as closed', () => {
    const base = {
      startsAt: new Date('2026-10-22T18:00:00.000Z'),
      endsAt: new Date('2026-10-22T20:00:00.000Z'),
    }
    expect(isEventActive({ ...base, deletedAt: new Date() }, '2026-10-22', '19:00')).toBe(false)
    expect(isEventActive({ ...base, cancelled: true }, '2026-10-22', '19:00')).toBe(false)
  })

  it('event-linked lists gate open/closed unless a schedule also opens them', () => {
    const event = {
      startsAt: new Date('2026-10-22T18:00:00.000Z'),
      endsAt: new Date('2026-10-22T20:00:00.000Z'),
    }
    // No time gate of its own: the event is the gate.
    expect(isChecklistOpen(null, null, thursday, '17:00', [], THU, [event])).toBe(false)
    expect(isChecklistOpen(null, null, thursday, '18:30', [], THU, [event])).toBe(true)
    expect(isChecklistHidden(null, null, thursday, '17:00', [], THU, [event])).toBe(true)
    // Any active event opens the list.
    const later = {
      startsAt: new Date('2026-10-22T21:00:00.000Z'),
      endsAt: new Date('2026-10-22T22:00:00.000Z'),
    }
    expect(isChecklistOpen(null, null, thursday, '21:30', [], THU, [event, later])).toBe(true)
    // Activation still force-opens outside the event.
    expect(isChecklistOpen(null, new Date('2026-10-22T00:00:00.000Z'), thursday, '09:00', [], THU, [event])).toBe(true)
  })

  it('labels the next linked event opening', () => {
    const friday = new Date('2026-10-23T00:00:00.000Z')
    const event = {
      title: 'DINNER',
      startsAt: new Date('2026-10-23T18:00:00.000Z'),
      endsAt: new Date('2026-10-23T22:00:00.000Z'),
      allDay: false,
    }
    expect(describeNextOpen({ events: [event], day: thursday, nowHHmm: '09:00', dayOfWeek: THU }))
      .toBe('OPENS FRI 18:00 · DINNER')
    expect(describeNextOpen({ events: [event], day: friday, nowHHmm: '17:00', dayOfWeek: FRI }))
      .toBe('OPENS FRI 18:00 · DINNER')
    expect(describeNextOpen({ events: [event], day: friday, nowHHmm: '19:00', dayOfWeek: FRI }))
      .toBeNull()
  })

  it('summarises a calendar event for the picker', () => {
    expect(summariseCalendarEvent({
      id: 'e1', venueId: 'v1', title: 'DINNER',
      startsAt: new Date('2026-10-23T18:00:00.000Z'),
      endsAt: new Date('2026-10-23T22:00:00.000Z'),
      allDay: false,
    })).toEqual({
      id: 'e1', venueId: 'v1', title: 'DINNER',
      startsAt: '2026-10-23T18:00:00.000Z',
      endsAt: '2026-10-23T22:00:00.000Z',
      date: '2026-10-23', startTime: '18:00', endTime: '22:00', allDay: false, deletedAt: null,
    })
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
