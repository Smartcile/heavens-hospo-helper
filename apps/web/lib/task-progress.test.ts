import { describe, it, expect } from 'vitest'
import {
  progressDayKey,
  isProgressLive,
  isStaleProgress,
  carryTaskToday,
} from './task-progress'

const TODAY = '2026-11-08'
const YESTERDAY = '2026-11-07'
const todayDate = new Date('2026-11-08T00:00:00.000Z')
const yesterdayDate = new Date('2026-11-07T00:00:00.000Z')

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
