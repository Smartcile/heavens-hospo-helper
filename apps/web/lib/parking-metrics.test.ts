import { describe, expect, it } from 'vitest'
import {
  buildParkingMetrics,
  combineTotals,
  summariseAttempts,
  type ParkingMetricAttempt,
} from './parking-metrics'

function at(date: string, status: string, message: string | null = null): ParkingMetricAttempt {
  return { createdAt: `${date}T10:00:00Z`, status, message }
}

describe('summariseAttempts — 90 minute', () => {
  it('counts confirmed, already and failed', () => {
    const totals = summariseAttempts(
      [
        at('2026-11-12', 'CONFIRMED'),
        at('2026-11-12', 'ALREADY_ACTIVE'),
        at('2026-11-12', 'FAILED'),
      ],
      'SCAN2PAY_90',
    )
    expect(totals).toMatchObject({
      attempts: 3,
      confirmed: 1,
      already: 1,
      failed: 1,
      pending: 0,
    })
    expect(totals.successRate).toBeCloseTo(1 / 3)
  })
})

describe('summariseAttempts — 4 hour', () => {
  it('treats manual confirmation as success and captcha as failure', () => {
    const totals = summariseAttempts(
      [
        at('2026-11-12', 'CONFIRMED'),
        at('2026-11-12', 'MANUAL_CONFIRMED'),
        at('2026-11-12', 'CAPTCHA_BLOCKED'),
        at('2026-11-12', 'PENDING'),
      ],
      'VPERMIT_4H',
    )
    expect(totals.confirmed).toBe(2)
    expect(totals.failed).toBe(1)
    expect(totals.pending).toBe(1)
    expect(totals.attempts).toBe(4)
    expect(totals.successRate).toBeCloseTo(2 / 3)
  })
})

describe('combineTotals', () => {
  it('adds the buckets and recomputes the rate', () => {
    const total = combineTotals(
      { attempts: 2, confirmed: 1, already: 0, failed: 1, pending: 0, successRate: 0.5 },
      { attempts: 1, confirmed: 1, already: 0, failed: 0, pending: 0, successRate: 1 },
    )
    expect(total).toMatchObject({ attempts: 3, confirmed: 2, failed: 1 })
    expect(total.successRate).toBeCloseTo(2 / 3)
  })
})

describe('buildParkingMetrics', () => {
  it('builds totals, staff entries, by-type and failure reasons', () => {
    const metrics = buildParkingMetrics({
      timezone: 'Pacific/Auckland',
      kiosk90: [at('2026-11-12', 'CONFIRMED'), at('2026-11-12', 'FAILED', 'COULD NOT REACH SCAN2PAY')],
      worker90: [at('2026-11-12', 'CONFIRMED')],
      claims: [
        { ...at('2026-11-12', 'CONFIRMED'), typeId: 't1', typeName: 'RAYC' },
        { ...at('2026-11-12', 'CAPTCHA_BLOCKED', 'BLOCKED'), typeId: 't1', typeName: 'RAYC' },
        { ...at('2026-11-12', 'CONFIRMED'), typeId: 't2', typeName: 'TRUST' },
      ],
      staff: {
        activePlates: 4,
        entered: 2,
        awaitingEntry: 2,
        pending: 1,
        approved: 3,
        rejected: 1,
      },
      members: 6,
      memberPlates: 7,
      health: { ok: 2, failed: 1, lastCheckAt: null, lastCheckOk: true, message: 'OK' },
    })

    expect(metrics.scan2pay90.total.confirmed).toBe(2)
    expect(metrics.vpermit4h.totals.confirmed).toBe(2)
    expect(metrics.plateEntries).toBe(6)
    expect(metrics.vpermit4h.byType).toHaveLength(2)
    expect(metrics.vpermit4h.topFailures).toEqual([
      { message: 'BLOCKED', count: 1 },
      { message: 'COULD NOT REACH SCAN2PAY', count: 1 },
    ])
    expect(metrics.members).toEqual({ members: 6, plates: 7 })
    expect(metrics.staff.entered).toBe(2)
  })

  it('buckets days in the venue timezone', () => {
    const metrics = buildParkingMetrics({
      timezone: 'Pacific/Auckland',
      kiosk90: [{ createdAt: '2026-11-12T12:00:00Z', status: 'CONFIRMED' }],
      worker90: [],
      claims: [],
      staff: {
        activePlates: 0,
        entered: 0,
        awaitingEntry: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      },
      members: 0,
      memberPlates: 0,
      health: { ok: 0, failed: 0, lastCheckAt: null, lastCheckOk: null, message: null },
    })
    // 12:00 UTC is the next day in NZ during daylight saving.
    expect(metrics.byDay).toEqual([{ date: '2026-11-13', confirmed: 1, already: 0, failed: 0 }])
  })
})
