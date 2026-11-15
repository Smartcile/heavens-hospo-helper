// Pure parking metrics. Prisma-free so the same rules can be unit-tested and
// shared by the admin page.

import { wallClockParts } from './parking'

export type ParkingMetricSystem = 'SCAN2PAY_90' | 'VPERMIT_4H'
type Bucket = 'confirmed' | 'already' | 'failed' | 'pending'

export interface ParkingMetricAttempt {
  createdAt: Date | string
  status: string
  message?: string | null
  durationMs?: number | null
  typeId?: string | null
  typeName?: string | null
}

export interface ParkingMetricTotals {
  attempts: number
  confirmed: number
  already: number
  failed: number
  pending: number
  successRate: number
}

export interface ParkingMetricsStaff {
  activePlates: number
  entered: number
  awaitingEntry: number
  pending: number
  approved: number
  rejected: number
}

export interface ParkingMetricsHealth {
  ok: number
  failed: number
  lastCheckAt: Date | null
  lastCheckOk: boolean | null
  message: string | null
}

export interface ParkingMetricsInput {
  timezone: string
  kiosk90: ParkingMetricAttempt[]
  worker90: ParkingMetricAttempt[]
  claims: ParkingMetricAttempt[]
  staff: ParkingMetricsStaff
  members: number
  memberPlates: number
  health: ParkingMetricsHealth
}

export interface ParkingDayMetric {
  date: string
  confirmed: number
  already: number
  failed: number
}

export interface ParkingFailureReason {
  message: string
  count: number
}

export interface ParkingTypeMetric {
  typeId: string
  typeName: string
  totals: ParkingMetricTotals
}

export interface ParkingMetrics {
  plateEntries: number
  totals: ParkingMetricTotals
  scan2pay90: {
    kiosk: ParkingMetricTotals
    worker: ParkingMetricTotals
    total: ParkingMetricTotals
  }
  vpermit4h: {
    totals: ParkingMetricTotals
    byType: ParkingTypeMetric[]
    topFailures: ParkingFailureReason[]
  }
  staff: ParkingMetricsStaff
  members: { members: number; plates: number }
  byDay: ParkingDayMetric[]
  health: ParkingMetricsHealth
}

export function emptyTotals(): ParkingMetricTotals {
  return {
    attempts: 0,
    confirmed: 0,
    already: 0,
    failed: 0,
    pending: 0,
    successRate: 0,
  }
}

function bucketFor(status: string, system: ParkingMetricSystem): Bucket {
  if (system === 'SCAN2PAY_90') {
    if (status === 'CONFIRMED') return 'confirmed'
    if (status === 'ALREADY_ACTIVE') return 'already'
    if (status === 'FAILED') return 'failed'
    return 'pending'
  }

  if (status === 'CONFIRMED' || status === 'MANUAL_CONFIRMED') return 'confirmed'
  if (status === 'ALREADY_CLAIMED') return 'already'
  if (
    status === 'FAILED' ||
    status === 'CAPTCHA_BLOCKED' ||
    status === 'EXHAUSTED' ||
    status === 'MANUAL_UNCONFIRMED'
  ) {
    return 'failed'
  }
  return 'pending'
}

function withRate(totals: Omit<ParkingMetricTotals, 'successRate'>): ParkingMetricTotals {
  const decided = totals.confirmed + totals.already + totals.failed
  return {
    ...totals,
    successRate: decided === 0 ? 0 : totals.confirmed / decided,
  }
}

export function summariseAttempts(
  attempts: ParkingMetricAttempt[],
  system: ParkingMetricSystem,
): ParkingMetricTotals {
  const totals = emptyTotals()
  for (const attempt of attempts) {
    const bucket = bucketFor(attempt.status, system)
    totals.attempts += 1
    totals[bucket] += 1
  }
  return withRate(totals)
}

export function combineTotals(...parts: ParkingMetricTotals[]): ParkingMetricTotals {
  const totals = emptyTotals()
  for (const part of parts) {
    totals.attempts += part.attempts
    totals.confirmed += part.confirmed
    totals.already += part.already
    totals.failed += part.failed
    totals.pending += part.pending
  }
  return withRate(totals)
}

function topFailureReasons(
  groups: { attempts: ParkingMetricAttempt[]; system: ParkingMetricSystem }[],
): ParkingFailureReason[] {
  const counts = new Map<string, number>()
  for (const group of groups) {
    for (const attempt of group.attempts) {
      if (bucketFor(attempt.status, group.system) !== 'failed') continue
      const message = (attempt.message ?? '').trim().toUpperCase() || 'UNKNOWN FAILURE'
      counts.set(message, (counts.get(message) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count || a.message.localeCompare(b.message))
    .slice(0, 5)
}

function metricsByDay(input: ParkingMetricsInput): ParkingDayMetric[] {
  const days = new Map<string, ParkingDayMetric>()
  const add = (attempts: ParkingMetricAttempt[], system: ParkingMetricSystem) => {
    for (const attempt of attempts) {
      const date = wallClockParts(new Date(attempt.createdAt), input.timezone).date
      const day = days.get(date) ?? { date, confirmed: 0, already: 0, failed: 0 }
      const bucket = bucketFor(attempt.status, system)
      if (bucket !== 'pending') day[bucket] += 1
      days.set(date, day)
    }
  }
  add(input.kiosk90, 'SCAN2PAY_90')
  add(input.worker90, 'SCAN2PAY_90')
  add(input.claims, 'VPERMIT_4H')
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function buildParkingMetrics(input: ParkingMetricsInput): ParkingMetrics {
  const kiosk = summariseAttempts(input.kiosk90, 'SCAN2PAY_90')
  const worker = summariseAttempts(input.worker90, 'SCAN2PAY_90')
  const scan2payTotal = combineTotals(kiosk, worker)
  const claims = summariseAttempts(input.claims, 'VPERMIT_4H')

  const byType = new Map<string, ParkingTypeMetric>()
  for (const claim of input.claims) {
    const typeId = claim.typeId ?? 'unknown'
    const existing =
      byType.get(typeId) ??
      ({
        typeId,
        typeName: claim.typeName ?? 'UNKNOWN',
        totals: emptyTotals(),
      } satisfies ParkingTypeMetric)
    const bucket = bucketFor(claim.status, 'VPERMIT_4H')
    existing.totals.attempts += 1
    existing.totals[bucket] += 1
    byType.set(typeId, existing)
  }
  const typeMetrics = [...byType.values()].map((row) => ({
    ...row,
    totals: withRate(row.totals),
  }))
  typeMetrics.sort((a, b) => b.totals.attempts - a.totals.attempts)

  const guestTotals = combineTotals(scan2payTotal, claims)
  return {
    plateEntries: guestTotals.confirmed + input.staff.entered,
    totals: guestTotals,
    scan2pay90: { kiosk, worker, total: scan2payTotal },
    vpermit4h: {
      totals: claims,
      byType: typeMetrics,
      topFailures: topFailureReasons([
        { attempts: input.kiosk90, system: 'SCAN2PAY_90' },
        { attempts: input.worker90, system: 'SCAN2PAY_90' },
        { attempts: input.claims, system: 'VPERMIT_4H' },
      ]),
    },
    staff: input.staff,
    members: { members: input.members, plates: input.memberPlates },
    byDay: metricsByDay(input),
    health: input.health,
  }
}
