import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PUSH_ALERT_AFTER,
  isHiddenToday,
  isPushAllowed,
  normalisePushAlertAfter,
  normalisePushNote,
  openPushList,
  pushStreakCount,
  shouldAlert,
  streakAlerted,
  tomorrowKey,
} from './task-push'

const day = (key: string) => new Date(`${key}T00:00:00.000Z`)

describe('tomorrowKey', () => {
  it('advances a normal day', () => {
    expect(tomorrowKey('2026-11-27')).toBe('2026-11-28')
  })

  it('rolls over month and year boundaries', () => {
    expect(tomorrowKey('2026-11-30')).toBe('2026-12-01')
    expect(tomorrowKey('2026-12-31')).toBe('2027-01-01')
  })
})

describe('isPushAllowed', () => {
  it('is true only for an open list that allows it', () => {
    expect(isPushAllowed({ name: 'SIDE WORK', allowPushToTomorrow: true })).toBe(true)
    expect(isPushAllowed({ name: 'SIDE WORK', allowPushToTomorrow: false })).toBe(false)
    expect(isPushAllowed(null)).toBe(false)
    expect(isPushAllowed(undefined)).toBe(false)
  })
})

describe('openPushList', () => {
  it('picks the first open list by appear-from then name', () => {
    const list = openPushList(
      [
        { name: 'LATE', appearFromTime: '17:00', allowPushToTomorrow: true },
        { name: 'OPENING', appearFromTime: '07:00', allowPushToTomorrow: true },
        { name: 'ALWAYS', appearFromTime: null, allowPushToTomorrow: false },
      ],
      { today: day('2026-11-27'), nowHHmm: '12:00' },
    )
    expect(list?.name).toBe('ALWAYS')
  })

  it('ignores lists that have not opened yet and returns null when none are open', () => {
    const list = openPushList(
      [{ name: 'LATE', appearFromTime: '17:00', allowPushToTomorrow: true }],
      { today: day('2026-11-27'), nowHHmm: '12:00' },
    )
    expect(list).toBeNull()
  })
})

describe('pushStreakCount', () => {
  const rows = [
    { fromDate: day('2026-11-24'), toDate: day('2026-11-25') },
    { fromDate: day('2026-11-25'), toDate: day('2026-11-26') },
    { fromDate: day('2026-11-26'), toDate: day('2026-11-27') },
  ]

  it('counts a consecutive chain in any order', () => {
    expect(pushStreakCount(rows)).toBe(3)
    expect(pushStreakCount([...rows].reverse())).toBe(3)
  })

  it('stops at a gap (task was worked again in between)', () => {
    expect(
      pushStreakCount([
        ...rows,
        { fromDate: day('2026-11-20'), toDate: day('2026-11-21') },
      ]),
    ).toBe(3)
  })

  it('returns 0 for no pushes and ignores malformed rows', () => {
    expect(pushStreakCount([])).toBe(0)
    expect(pushStreakCount([{ fromDate: null, toDate: null }])).toBe(0)
  })

  it('reports whether the current streak already alerted', () => {
    expect(streakAlerted(rows)).toBe(false)
    const alerted = rows.map((r, i) => (i === 2 ? { ...r, alertedAt: day('2026-11-26') } : r))
    expect(streakAlerted(alerted)).toBe(true)
    // An alert on a PREVIOUS, broken streak does not count for the current one.
    const previousAlert = [
      ...rows,
      { fromDate: day('2026-11-20'), toDate: day('2026-11-21'), alertedAt: day('2026-11-20') },
    ]
    expect(streakAlerted(previousAlert)).toBe(false)
  })
})

describe('shouldAlert', () => {
  it('fires at the threshold, not before', () => {
    expect(shouldAlert(2, 3)).toBe(false)
    expect(shouldAlert(3, 3)).toBe(true)
    expect(shouldAlert(4, 3)).toBe(true)
  })

  it('never fires twice for the same streak', () => {
    expect(shouldAlert(3, 3, { alreadyAlerted: true })).toBe(false)
  })

  it('falls back to the default threshold for a missing or invalid value', () => {
    expect(shouldAlert(DEFAULT_PUSH_ALERT_AFTER - 1, null)).toBe(false)
    expect(shouldAlert(DEFAULT_PUSH_ALERT_AFTER, null)).toBe(true)
    expect(shouldAlert(DEFAULT_PUSH_ALERT_AFTER, 0)).toBe(true)
  })
})

describe('normalisePushAlertAfter', () => {
  it('defaults and clamps', () => {
    expect(normalisePushAlertAfter(undefined)).toBe(DEFAULT_PUSH_ALERT_AFTER)
    expect(normalisePushAlertAfter('')).toBe(DEFAULT_PUSH_ALERT_AFTER)
    expect(normalisePushAlertAfter('2')).toBe(2)
    expect(normalisePushAlertAfter(2.6)).toBe(3)
    expect(normalisePushAlertAfter(0)).toBe(DEFAULT_PUSH_ALERT_AFTER)
    expect(normalisePushAlertAfter(999)).toBe(50)
  })
})

describe('normalisePushNote', () => {
  it('trims, caps at 500 characters and blanks to null', () => {
    expect(normalisePushNote('  needs a second coat  ')).toBe('needs a second coat')
    expect(normalisePushNote('   ')).toBeNull()
    expect(normalisePushNote(null)).toBeNull()
    expect(normalisePushNote(42)).toBeNull()
    expect(normalisePushNote('x'.repeat(600))).toHaveLength(500)
  })
})

describe('isHiddenToday', () => {
  it('hides a future push only', () => {
    expect(isHiddenToday(day('2026-11-28'), '2026-11-27')).toBe(true)
    expect(isHiddenToday('2026-11-28', '2026-11-27')).toBe(true)
    // On its day (and after) the task is back.
    expect(isHiddenToday(day('2026-11-27'), '2026-11-27')).toBe(false)
    expect(isHiddenToday(day('2026-11-26'), '2026-11-27')).toBe(false)
    expect(isHiddenToday(null, '2026-11-27')).toBe(false)
  })
})
