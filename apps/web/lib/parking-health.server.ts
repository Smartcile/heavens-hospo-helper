// Server side of the guest-parking health check. Reads the venue config,
// probes Scan2Pay with the configured fake plate and records the result.
//
// READINESS (the default) only GETs the form — no parking session is created.
// FULL additionally submits the fake plate end-to-end.

import { prisma } from '@hospo-ops/db'
import {
  normaliseCheckMode,
  parkingHealthState,
  SCAN2PAY_BASE_URL,
  wallClockParts,
  type ParkingCheckMode,
  type ParkingHealthState,
} from './parking'
import { checkParking, type ParkingCheckResult, type ParkingTarget } from './scan2pay.server'

export interface ParkingHealthRunResult {
  venueId: string
  mode: 'READINESS' | 'FULL'
  ok: boolean
  message: string
  httpStatus: number
  durationMs: number
  skipped?: string
}

interface ConfigRow {
  venueId: string
  enabled: boolean
  carparkId: number | null
  carparkName: string | null
  durationMinutes: number
  healthCheckMode: string
  healthPlate: string
  lastCheckAt: Date | null
  lastCheckOk: boolean | null
  lastCheckMessage: string | null
  deletedAt: Date | null
  venue: { timezone: string }
}

function targetFor(config: ConfigRow): ParkingTarget | null {
  if (!config.carparkId) return null
  return {
    baseUrl: SCAN2PAY_BASE_URL,
    carparkId: config.carparkId,
    carparkName: config.carparkName,
    durationMinutes: config.durationMinutes,
  }
}

function dateKeyIn(date: Date, timezone: string): string {
  return wallClockParts(date, timezone).date
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function record(
  venueId: string,
  mode: 'READINESS' | 'FULL',
  ok: boolean,
  httpStatus: number,
  message: string,
  durationMs: number,
  now: Date,
): Promise<void> {
  await prisma.$transaction([
    prisma.parkingHealthCheck.create({
      data: { venueId, mode, ok, httpStatus, message, durationMs },
    }),
    prisma.parkingConfig.update({
      where: { venueId },
      data: { lastCheckAt: now, lastCheckOk: ok, lastCheckMessage: message },
    }),
  ])
}

async function runOne(
  config: ConfigRow,
  args: { mode?: 'READINESS' | 'FULL'; now: Date; force: boolean },
): Promise<ParkingHealthRunResult | null> {
  if (!config.enabled || config.deletedAt) return null

  const configuredMode = normaliseCheckMode(config.healthCheckMode) as ParkingCheckMode
  if (!args.mode && configuredMode === 'OFF') return null

  const mode: 'READINESS' | 'FULL' =
    args.mode ?? (configuredMode === 'FULL' ? 'FULL' : 'READINESS')
  const timezone = config.venue.timezone || 'Pacific/Auckland'

  if (
    !args.force &&
    config.lastCheckAt &&
    dateKeyIn(config.lastCheckAt, timezone) === dateKeyIn(args.now, timezone)
  ) {
    return {
      venueId: config.venueId,
      mode,
      ok: config.lastCheckOk === true,
      message: 'ALREADY CHECKED TODAY',
      httpStatus: 0,
      durationMs: 0,
      skipped: 'ALREADY CHECKED TODAY',
    }
  }

  const target = targetFor(config)
  const started = Date.now()

  let result: ParkingCheckResult
  if (!target) {
    result = {
      ok: false,
      httpStatus: 0,
      message: 'NO CARPARK ID CONFIGURED',
      mode,
      snippet: '',
      existing: { active: false },
    }
  } else {
    try {
      result = await checkParking({
        target,
        plate: config.healthPlate,
        mode,
        timezone,
        now: args.now,
      })
    } catch (error) {
      result = {
        ok: false,
        httpStatus: 0,
        message: `COULD NOT REACH SCAN2PAY: ${errorText(error)}`,
        mode,
        snippet: '',
        existing: { active: false },
      }
    }
  }

  const durationMs = Date.now() - started
  await record(config.venueId, mode, result.ok, result.httpStatus, result.message, durationMs, args.now)

  return {
    venueId: config.venueId,
    mode,
    ok: result.ok,
    message: result.message,
    httpStatus: result.httpStatus,
    durationMs,
  }
}

/** Run the configured check for one venue (used by the admin "RUN CHECK NOW"). */
export async function runParkingHealthCheck(args: {
  venueId: string
  mode?: 'READINESS' | 'FULL'
  now?: Date
  force?: boolean
}): Promise<ParkingHealthRunResult | null> {
  const config = await prisma.parkingConfig.findUnique({
    where: { venueId: args.venueId },
    include: { venue: { select: { timezone: true } } },
  })
  if (!config) return null
  return runOne(config, {
    mode: args.mode,
    now: args.now ?? new Date(),
    force: args.force ?? true,
  })
}

/** Run every enabled venue's check (called by the daily internal cron). */
export async function runParkingHealthChecks(args?: {
  now?: Date
  force?: boolean
}): Promise<ParkingHealthRunResult[]> {
  const now = args?.now ?? new Date()
  const configs = await prisma.parkingConfig.findMany({
    where: { enabled: true, deletedAt: null },
    include: { venue: { select: { timezone: true } } },
  })

  const results: ParkingHealthRunResult[] = []
  for (const config of configs) {
    const result = await runOne(config, { now, force: args?.force ?? false })
    if (result) results.push(result)
  }
  return results
}

/** Current health for the admin/worker status surfaces. */
export async function parkingHealthForVenue(
  venueId: string,
  now: Date = new Date(),
): Promise<ParkingHealthState> {
  const config = await prisma.parkingConfig.findUnique({
    where: { venueId },
    select: {
      lastCheckAt: true,
      lastCheckOk: true,
      lastCheckMessage: true,
      venue: { select: { timezone: true } },
    },
  })
  if (!config) return { ok: false, stale: true, message: 'NOT CONFIGURED' }
  const state = parkingHealthState(config.lastCheckAt, config.lastCheckOk, config.lastCheckMessage, now)
  if (!config.lastCheckAt) return state
  if (config.venue.timezone) {
    const today = dateKeyIn(now, config.venue.timezone)
    const checked = dateKeyIn(config.lastCheckAt, config.venue.timezone)
    if (today !== checked) return { ...state, stale: true }
  }
  return state
}
