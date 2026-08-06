import { describe, expect, it } from 'vitest'
import { addMinutesHHMM, computeCoverTotals, dayOfWeekForDate, slotEndForTime, slotsForDate, timeInSlot } from './service-schedule'

const svc = {
  slots: [
    { dayOfWeek: 5, startTime: '17:00', endTime: '18:00', maxCovers: 20 },
    { dayOfWeek: 5, startTime: '18:00', endTime: '19:00', maxCovers: 30 },
    { dayOfWeek: 6, startTime: '12:00', endTime: '14:00', maxCovers: 40 },
  ],
  exceptions: [
    { date: '2026-08-14', closed: true, startTime: null, endTime: null, maxCovers: null },
    { date: '2026-08-15', closed: false, startTime: '10:00', endTime: '12:00', maxCovers: 8 },
    { date: '2026-08-21', closed: false, startTime: null, endTime: null, maxCovers: null },
  ],
}

describe('dayOfWeekForDate', () => {
  it('maps a date to 0=Sun..6=Sat', () => {
    expect(dayOfWeekForDate('2026-08-09')).toBe(0) // Sunday
    expect(dayOfWeekForDate('2026-08-10')).toBe(1) // Monday
    expect(dayOfWeekForDate('2026-08-14')).toBe(5) // Friday
    expect(dayOfWeekForDate('2026-08-15')).toBe(6) // Saturday
  })
})

describe('slotsForDate', () => {
  it('uses the weekly rule for a normal day', () => {
    const r = slotsForDate(svc, '2026-08-28') // Friday, no exception
    expect(r.closed).toBe(false)
    expect(r.slots).toEqual([
      { startTime: '17:00', endTime: '18:00', maxCovers: 20 },
      { startTime: '18:00', endTime: '19:00', maxCovers: 30 },
    ])
  })

  it('is closed on a day the service does not run', () => {
    const r = slotsForDate(svc, '2026-08-11') // Tuesday
    expect(r.closed).toBe(true)
    expect(r.slots).toEqual([])
  })

  it('closed exception shuts the day down', () => {
    const r = slotsForDate(svc, '2026-08-14')
    // exception without closed → uses weekly; use a closed exception date instead
    const closed = slotsForDate({ ...svc, exceptions: [{ date: '2026-08-14', closed: true, startTime: null, endTime: null, maxCovers: null }] }, '2026-08-14')
    expect(closed.closed).toBe(true)
    expect(closed.slots).toEqual([])
  })

  it('exception with times overrides the weekly rule', () => {
    const r = slotsForDate(svc, '2026-08-15') // Saturday, but exception overrides
    expect(r.closed).toBe(false)
    expect(r.slots).toEqual([{ startTime: '10:00', endTime: '12:00', maxCovers: 8 }])
  })

  it('open exception without times falls back to the weekly rule', () => {
    const r = slotsForDate(svc, '2026-08-21') // Friday, open exception, no times
    expect(r.slots.length).toBe(2)
    expect(r.slots[0].startTime).toBe('17:00')
  })
})

describe('timeInSlot', () => {
  it('is half-open [start, end)', () => {
    expect(timeInSlot('17:30', '17:00', '18:00')).toBe(true)
    expect(timeInSlot('17:00', '17:00', '18:00')).toBe(true)
    expect(timeInSlot('18:00', '17:00', '18:00')).toBe(false)
    expect(timeInSlot('16:59', '17:00', '18:00')).toBe(false)
  })
})

describe('slotEndForTime', () => {
  it('returns the matching slot end', () => {
    expect(slotEndForTime(svc, '2026-08-28', '17:00')).toBe('18:00')
    expect(slotEndForTime(svc, '2026-08-28', '18:00')).toBe('19:00')
  })

  it('returns null for a time that is not a slot start', () => {
    expect(slotEndForTime(svc, '2026-08-28', '17:30')).toBeNull()
  })

  it('returns null on a closed day or no rule', () => {
    expect(slotEndForTime(svc, '2026-08-14', '17:00')).toBeNull() // closed exception
    expect(slotEndForTime(svc, '2026-08-11', '17:00')).toBeNull() // no rule (Tue)
  })

  it('honours exception overrides', () => {
    expect(slotEndForTime(svc, '2026-08-15', '10:00')).toBe('12:00')
  })
})

describe('addMinutesHHMM', () => {
  it('adds across the hour boundary', () => {
    expect(addMinutesHHMM('17:30', 90)).toBe('19:00')
    expect(addMinutesHHMM('23:45', 30)).toBe('00:15')
  })

  it('adds zero and plain minutes', () => {
    expect(addMinutesHHMM('17:00', 0)).toBe('17:00')
    expect(addMinutesHHMM('18:10', 50)).toBe('19:00')
  })
})

describe('computeCoverTotals', () => {
  const slots = [
    { startTime: '17:00', endTime: '18:00', maxCovers: 20 },
    { startTime: '18:00', endTime: '19:00', maxCovers: 30 },
  ]

  it('starts empty', () => {
    const t = computeCoverTotals(slots, 4, [], [])
    expect(t.map((x) => ({ ...x }))).toEqual([
      { startTime: '17:00', endTime: '18:00', maxCovers: 20, usedCovers: 0, remaining: 20, available: true },
      { startTime: '18:00', endTime: '19:00', maxCovers: 30, usedCovers: 0, remaining: 30, available: true },
    ])
  })

  it('counts order party sizes within the slot window', () => {
    const orders = [
      { serviceTime: '17:15', partySize: 4 },
      { serviceTime: '17:45', partySize: 2 },
      { serviceTime: '18:05', partySize: 10 },
    ]
    const t = computeCoverTotals(slots, 2, orders, [])
    expect(t[0].usedCovers).toBe(6)
    expect(t[0].remaining).toBe(14)
    expect(t[1].usedCovers).toBe(10)
  })

  it('counts bookings at the slot start', () => {
    const bookings = [{ startTime: '17:00', partySize: 6 }]
    const t = computeCoverTotals(slots, 2, [], bookings)
    expect(t[0].usedCovers).toBe(6)
    expect(t[1].usedCovers).toBe(0)
  })

  it('available is false when the party does not fit', () => {
    const bookings = [{ startTime: '17:00', partySize: 18 }]
    const t = computeCoverTotals(slots, 4, [], bookings)
    expect(t[0].available).toBe(false)
    expect(t[0].remaining).toBe(2)
    expect(t[1].available).toBe(true)
  })

  it('remaining never goes negative', () => {
    const orders = [{ serviceTime: '17:10', partySize: 50 }]
    const t = computeCoverTotals(slots, 1, orders, [])
    expect(t[0].remaining).toBe(0)
  })

  it('missing party sizes count as 1', () => {
    const orders = [{ serviceTime: '17:10', partySize: 0 as unknown as number }]
    const t = computeCoverTotals(slots, 1, orders, [])
    expect(t[0].usedCovers).toBe(1)
  })
})
