import { describe, expect, it } from 'vitest'
import {
  bookingFitsWindows,
  bookableSlotsForService,
  serviceWindowsForDate,
  type ServiceWindowInput,
} from './service-windows'

const friday = (start: string, end: string): ServiceWindowInput => ({
  name: 'FRIDAY MENU',
  slots: [{ dayOfWeek: 5, startTime: start, endTime: end }],
  exceptions: [],
})

const sunday = (start: string, end: string): ServiceWindowInput => ({
  name: 'SUNDAY ROAST',
  slots: [{ dayOfWeek: 0, startTime: start, endTime: end }],
  exceptions: [],
})

describe('serviceWindowsForDate', () => {
  it('returns the weekly slot for the matching weekday', () => {
    // 2026-08-14 is a Friday
    expect(serviceWindowsForDate([friday('17:00', '21:00')], '2026-08-14')).toEqual([
      { startMins: 1020, endMins: 1260, names: ['FRIDAY MENU'] },
    ])
  })

  it('returns nothing on a weekday with no slot', () => {
    // 2026-08-10 is a Monday
    expect(serviceWindowsForDate([friday('17:00', '21:00')], '2026-08-10')).toEqual([])
  })

  it('drops the day when a date exception closes it', () => {
    const svc: ServiceWindowInput = {
      ...friday('17:00', '21:00'),
      exceptions: [{ date: '2026-08-14', closed: true, startTime: null, endTime: null }],
    }
    expect(serviceWindowsForDate([svc], '2026-08-14')).toEqual([])
  })

  it('overrides the weekly rule with an exception time', () => {
    const svc: ServiceWindowInput = {
      ...friday('17:00', '21:00'),
      exceptions: [{ date: '2026-08-14', closed: false, startTime: '18:30', endTime: '23:00' }],
    }
    expect(serviceWindowsForDate([svc], '2026-08-14')).toEqual([
      { startMins: 1110, endMins: 1380, names: ['FRIDAY MENU'] },
    ])
  })

  it('merges overlapping windows and unions the labels', () => {
    const svcA = friday('17:00', '21:00')
    const svcB: ServiceWindowInput = {
      name: 'LIVE MUSIC',
      slots: [{ dayOfWeek: 5, startTime: '19:00', endTime: '23:00' }],
      exceptions: [],
    }
    expect(serviceWindowsForDate([svcA, svcB], '2026-08-14')).toEqual([
      { startMins: 1020, endMins: 1380, names: ['FRIDAY MENU', 'LIVE MUSIC'] },
    ])
  })

  it('merges adjacent windows into one contiguous band', () => {
    const svcA = friday('17:00', '19:00')
    const svcB: ServiceWindowInput = {
      name: 'LATE BAR',
      slots: [{ dayOfWeek: 5, startTime: '19:00', endTime: '22:00' }],
      exceptions: [],
    }
    expect(serviceWindowsForDate([svcA, svcB], '2026-08-14')).toEqual([
      { startMins: 1020, endMins: 1320, names: ['FRIDAY MENU', 'LATE BAR'] },
    ])
  })

  it('keeps non-overlapping windows separate', () => {
    const svcA = friday('12:00', '14:00')
    const svcB = friday('18:00', '21:00')
    expect(serviceWindowsForDate([svcA, svcB], '2026-08-14')).toEqual([
      { startMins: 720, endMins: 840, names: ['FRIDAY MENU'] },
      { startMins: 1080, endMins: 1260, names: ['FRIDAY MENU'] },
    ])
  })

  it('handles a service with no name (server-side shapes)', () => {
    const svc: ServiceWindowInput = {
      slots: [{ dayOfWeek: 5, startTime: '17:00', endTime: '21:00' }],
      exceptions: [],
    }
    expect(serviceWindowsForDate([svc], '2026-08-14')).toEqual([
      { startMins: 1020, endMins: 1260, names: [] },
    ])
  })
})

describe('bookingFitsWindows', () => {
  const windows = serviceWindowsForDate([friday('17:00', '21:00')], '2026-08-14')

  it('accepts a booking wholly inside a window', () => {
    expect(bookingFitsWindows(windows, 1080, 1260)).toBe(true) // 18:00–21:00
  })

  it('rejects a booking that starts outside the window', () => {
    expect(bookingFitsWindows(windows, 1000, 1080)).toBe(false) // 16:40–18:00
  })

  it('rejects a booking that ends outside the window', () => {
    expect(bookingFitsWindows(windows, 1080, 1320)).toBe(false) // 18:00–22:00
  })

  it('rejects a booking spanning two windows', () => {
    const two = serviceWindowsForDate([friday('12:00', '14:00'), friday('18:00', '21:00')], '2026-08-14')
    expect(bookingFitsWindows(two, 840, 1080)).toBe(false) // 14:00–18:00 sits between
  })

  it('rejects everything when there are no windows', () => {
    expect(bookingFitsWindows([], 1080, 1260)).toBe(false)
  })
})

describe('bookableSlotsForService', () => {
  it('defaults to 15-minute starts across the window', () => {
    const slots = bookableSlotsForService(friday('17:00', '21:00'), '2026-08-14')
    expect(slots).toHaveLength(16)
    expect(slots[0]).toEqual({ startMins: 1020, endMins: 1260 })
    expect(slots[15]).toEqual({ startMins: 1245, endMins: 1260 }) // 20:45, clamped to window end
  })

  it('steps by the configured interval', () => {
    const svc: ServiceWindowInput = { ...friday('17:00', '21:00'), bookingIntervalMinutes: 30 }
    expect(bookableSlotsForService(svc, '2026-08-14').map((s) => s.startMins)).toEqual([1020, 1050, 1080, 1110, 1140, 1170, 1200, 1230])
  })

  it('steps hourly when the interval is 60', () => {
    const svc: ServiceWindowInput = { ...friday('17:00', '21:00'), bookingIntervalMinutes: 60 }
    expect(bookableSlotsForService(svc, '2026-08-14').map((s) => s.startMins)).toEqual([1020, 1080, 1140, 1200])
  })

  it('uses exactly the bookable times when set, ignoring the interval', () => {
    const svc: ServiceWindowInput = {
      ...friday('17:00', '21:00'),
      bookingIntervalMinutes: 15,
      bookableTimes: ['17:00', '18:00'],
    }
    expect(bookableSlotsForService(svc, '2026-08-14').map((s) => s.startMins)).toEqual([1020, 1080])
  })

  it('drops bookable times outside the window', () => {
    const svc: ServiceWindowInput = {
      ...friday('17:00', '21:00'),
      bookableTimes: ['17:00', '12:00', '22:00'],
    }
    expect(bookableSlotsForService(svc, '2026-08-14').map((s) => s.startMins)).toEqual([1020])
  })

  it('returns nothing when the service does not run that date', () => {
    expect(bookableSlotsForService(friday('17:00', '21:00'), '2026-08-10')).toEqual([])
  })

  it('falls back to 15 when the interval is missing or invalid', () => {
    const svc: ServiceWindowInput = { ...friday('17:00', '21:00'), bookingIntervalMinutes: 0 }
    expect(bookableSlotsForService(svc, '2026-08-14')).toHaveLength(16)
    expect(bookableSlotsForService(friday('17:00', '21:00'), '2026-08-14')).toHaveLength(16)
  })
})
