import { describe, it, expect } from 'vitest'
import {
  dueJobs,
  localParts,
  PRODUCT_PULL_INTERVAL_MS,
  type CronState,
} from './internal-cron'

const TZ = 'Pacific/Auckland'

// 2026-07-15 14:00 UTC = 2026-07-16 02:00 NZST (winter, UTC+12)
const UTC_1400 = new Date('2026-07-15T14:00:00Z')
// 2026-07-15 15:00 UTC = 2026-07-16 03:00 NZST
const UTC_1500 = new Date('2026-07-15T15:00:00Z')

describe('localParts', () => {
  it('converts UTC to the venue-local date and hour', () => {
    expect(localParts(UTC_1500, TZ)).toEqual({ dateKey: '2026-07-16', hour: 3 })
  })

  it('handles midnight as hour 0', () => {
    const midnight = new Date('2026-07-15T12:00:00Z') // 00:00 NZST on the 16th
    expect(localParts(midnight, TZ)).toEqual({ dateKey: '2026-07-16', hour: 0 })
  })
})

describe('dueJobs — product pull', () => {
  it('is due on first run (no last-run state)', () => {
    const state: CronState = { lastProductPullAt: null, lastExpiryScanDate: null }
    expect(dueJobs(state, UTC_1400, TZ).productPull).toBe(true)
  })

  it('is NOT due when last pull was under 15 minutes ago', () => {
    const state: CronState = {
      lastProductPullAt: UTC_1400.getTime() - 5 * 60 * 1000,
      lastExpiryScanDate: null,
    }
    expect(dueJobs(state, UTC_1400, TZ).productPull).toBe(false)
  })

  it('is due exactly at the 15-minute interval', () => {
    const state: CronState = {
      lastProductPullAt: UTC_1400.getTime() - PRODUCT_PULL_INTERVAL_MS,
      lastExpiryScanDate: null,
    }
    expect(dueJobs(state, UTC_1400, TZ).productPull).toBe(true)
  })
})

describe('dueJobs — expiry scan', () => {
  it('is NOT due before 03:00 local time', () => {
    const state: CronState = { lastProductPullAt: Date.now(), lastExpiryScanDate: null }
    expect(dueJobs(state, UTC_1400, TZ).expiryScan).toBe(false) // 02:00 local
  })

  it('is due at 03:00 local time when not yet run today', () => {
    const state: CronState = { lastProductPullAt: Date.now(), lastExpiryScanDate: null }
    expect(dueJobs(state, UTC_1500, TZ).expiryScan).toBe(true) // 03:00 local
  })

  it('is NOT due again on the same local date', () => {
    const state: CronState = { lastProductPullAt: Date.now(), lastExpiryScanDate: '2026-07-16' }
    expect(dueJobs(state, UTC_1500, TZ).expiryScan).toBe(false)
  })

  it('is due again the next local day', () => {
    const state: CronState = { lastProductPullAt: Date.now(), lastExpiryScanDate: '2026-07-15' }
    expect(dueJobs(state, UTC_1500, TZ).expiryScan).toBe(true)
  })
})
