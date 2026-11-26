import { describe, it, expect } from 'vitest'
import {
  progressDayKey,
  isProgressLive,
  isStaleProgress,
  isPushedToFuture,
  carryTaskToday,
} from './task-progress'

const TODAY = '2026-11-08'
const YESTERDAY = '2026-11-07'
const TOMORROW = '2026-11-09'
const todayDate = new Date('2026-11-08T00:00:00.000Z')
const yesterdayDate = new Date('2026-11-07T00:00:00.000Z')
const tomorrowDate = new Date('2026-11-09T00:00:00.000Z')

describe('progressDayKey', () => {
  it('formats a Prisma Date using UTC parts', () => {
    expect(progressDayKey(todayDate)).toBe(TODAY)
    expect(progressDayKey(yesterdayDate)).toBe(YESTERDAY)
  })

  it('slices an ISO string and accepts a bare day key', () => {
    expect(progressDayKey('2026-11-08T00:00:00.000Z')).toBe(TODAY)
    expect(progressDayKey(TODAY)).toBe(TODAY)
  })

  it('returns null for null / empty / malformed values', () => {
    expect(progressDayKey(null)).toBeNull()
    expect(progressDayKey(undefined)).toBeNull()
    expect(progressDayKey('')).toBeNull()
    expect(progressDayKey('  ')).toBeNull()
    expect(progressDayKey('nope')).toBeNull()
  })
})

describe('isProgressLive', () => {
  it('is live when reported today', () => {
    expect(isProgressLive(todayDate, TODAY)).toBe(true)
  })

  it('is stale when reported yesterday on a today-only list', () => {
    expect(isProgressLive(yesterdayDate, TODAY)).toBe(false)
  })

  it('treats a legacy null date as stale on a today-only list', () => {
    expect(isProgressLive(null, TODAY)).toBe(false)
  })

  it('is always live on a multi-day list, even for an old or null date', () => {
    expect(isProgressLive(yesterdayDate, TODAY, { multiDay: true })).toBe(true)
    expect(isProgressLive(null, TODAY, { multiDay: true })).toBe(true)
  })
})

describe('isStaleProgress', () => {
  it('does not flag a today partial', () => {
    expect(isStaleProgress(todayDate, TODAY)).toBe(false)
  })

  it('flags yesterday and null partials on a today-only list', () => {
    expect(isStaleProgress(yesterdayDate, TODAY)).toBe(true)
    expect(isStaleProgress(null, TODAY)).toBe(true)
  })

  it('never flags a multi-day partial', () => {
    expect(isStaleProgress(yesterdayDate, TODAY, { multiDay: true })).toBe(false)
    expect(isStaleProgress(null, TODAY, { multiDay: true })).toBe(false)
  })
})

describe('carryTaskToday', () => {
  it('keeps a task that is due today', () => {
    expect(
      carryTaskToday({ isDueToday: true, progress: null, todayKey: TODAY, multiDay: false }),
    ).toBe(true)
  })

  it('keeps a not-due task with a live partial', () => {
    expect(
      carryTaskToday({
        isDueToday: false,
        progress: { progressDate: todayDate },
        todayKey: TODAY,
        multiDay: false,
      }),
    ).toBe(true)
  })

  it('drops a not-due task whose partial is stale', () => {
    expect(
      carryTaskToday({
        isDueToday: false,
        progress: { progressDate: yesterdayDate },
        todayKey: TODAY,
        multiDay: false,
      }),
    ).toBe(false)
  })

  it('drops a not-due task with no progress', () => {
    expect(
      carryTaskToday({ isDueToday: false, progress: null, todayKey: TODAY, multiDay: false }),
    ).toBe(false)
  })

  it('keeps a not-due task that was completed today', () => {
    expect(
      carryTaskToday({
        isDueToday: false,
        progress: null,
        todayKey: TODAY,
        multiDay: false,
        completedToday: true,
      }),
    ).toBe(true)
  })

  it('still drops a not-due task with no completion and no live partial', () => {
    expect(
      carryTaskToday({
        isDueToday: false,
        progress: null,
        todayKey: TODAY,
        multiDay: false,
        completedToday: false,
      }),
    ).toBe(false)
  })

  it('keeps an old partial on a multi-day list', () => {
    expect(
      carryTaskToday({
        isDueToday: false,
        progress: { progressDate: yesterdayDate },
        todayKey: TODAY,
        multiDay: true,
      }),
    ).toBe(true)
  })
})

describe('FINISH TOMORROW pushes (#143)', () => {
  it('flags a push whose day is still ahead', () => {
    expect(isPushedToFuture(tomorrowDate, TODAY)).toBe(true)
    expect(isPushedToFuture(TOMORROW, TODAY)).toBe(true)
    expect(isPushedToFuture(todayDate, TODAY)).toBe(false)
    expect(isPushedToFuture(yesterdayDate, TODAY)).toBe(false)
    expect(isPushedToFuture(null, TODAY)).toBe(false)
  })

  it('hides a pushed task even when it is due today', () => {
    expect(
      carryTaskToday({
        isDueToday: true,
        progress: { progressDate: todayDate, pushedToDate: tomorrowDate },
        todayKey: TODAY,
        multiDay: false,
        completedToday: false,
      }),
    ).toBe(false)
  })

  it('brings the task back on the push day', () => {
    expect(
      carryTaskToday({
        isDueToday: true,
        progress: { progressDate: yesterdayDate, pushedToDate: todayDate },
        todayKey: TODAY,
        multiDay: false,
      }),
    ).toBe(true)
  })

  it('never sweeps a future push as stale', () => {
    expect(
      isStaleProgress(yesterdayDate, TODAY, { pushedToDate: tomorrowDate }),
    ).toBe(false)
    // A push that has already arrived can be swept like any other partial.
    expect(
      isStaleProgress(yesterdayDate, TODAY, { pushedToDate: todayDate }),
    ).toBe(true)
  })
})
