// Server-side health checks for the FTP 4-hour claim types.
//
// BROWSER (default) loads the claim page in the headless browser and verifies
// the form + reCAPTCHA script. It creates no session and uses no slot.
// FULL submits the configured health plate end-to-end and DOES use a slot, so
// it is opt-in.

import { prisma } from '@hospo-ops/db'
import { wallClockParts } from './parking'
import { checkVpermitBrowser, claimWithVpermit } from './vpermit.server'

export interface FtpHealthRunResult {
  venueId: string
  typeId: string
  typeName: string
  mode: 'BROWSER' | 'FULL'
  ok: boolean
  message: string
  httpStatus: number | null
  durationMs: number
  skipped?: string
}

type TypeRow = {
  id: string
  venueId: string
  name: string
  claimUrl: string | null
  contactEmail: string | null
  healthCheckMode: string
  healthPlate: string
  lastCheckAt: Date | null
  lastCheckOk: boolean | null
  lastCheckMessage: string | null
  deletedAt: Date | null
  isActive: boolean
  venue: { timezone: string }
}

function localDate(date: Date, timezone: string): string {
  return wallClockParts(date, timezone).date
}

async function record(args: {
  type: TypeRow
  mode: 'BROWSER' | 'FULL'
  ok: boolean
  httpStatus: number | null
  message: string
  durationMs: number
  now: Date
}): Promise<void> {
  await prisma.$transaction([
    prisma.parkingHealthCheck.create({
      data: {
        venueId: args.type.venueId,
        source: 'FTP_CLAIM',
        typeId: args.type.id,
        mode: args.mode,
        ok: args.ok,
        httpStatus: args.httpStatus ?? undefined,
        message: args.message,
        durationMs: args.durationMs,
        checkedAt: args.now,
      },
    }),
    prisma.ftpParkingType.update({
      where: { id: args.type.id },
      data: {
        lastCheckAt: args.now,
        lastCheckOk: args.ok,
        lastCheckMessage: args.message,
      },
    }),
  ])
}

async function runOne(
  type: TypeRow,
  args: { mode?: 'BROWSER' | 'FULL'; now: Date; force: boolean },
): Promise<FtpHealthRunResult | null> {
  if (!type.isActive || type.deletedAt) return null
  const configured = type.healthCheckMode
  if (!args.mode && configured === 'OFF') return null

  const mode: 'BROWSER' | 'FULL' =
    args.mode ?? (configured === 'FULL' ? 'FULL' : 'BROWSER')
  const timezone = type.venue.timezone || 'Pacific/Auckland'

  if (
    !args.force &&
    type.lastCheckAt &&
    localDate(type.lastCheckAt, timezone) === localDate(args.now, timezone)
  ) {
    return {
      venueId: type.venueId,
      typeId: type.id,
      typeName: type.name,
      mode,
      ok: type.lastCheckOk === true,
      message: 'ALREADY CHECKED TODAY',
      httpStatus: null,
      durationMs: 0,
      skipped: 'ALREADY CHECKED TODAY',
    }
  }

  if (!type.claimUrl) {
    await record({
      type,
      mode,
      ok: false,
      httpStatus: null,
      message: 'NO CLAIM URL CONFIGURED',
      durationMs: 0,
      now: args.now,
    })
    return {
      venueId: type.venueId,
      typeId: type.id,
      typeName: type.name,
      mode,
      ok: false,
      message: 'NO CLAIM URL CONFIGURED',
      httpStatus: null,
      durationMs: 0,
    }
  }

  const started = Date.now()
  if (mode === 'BROWSER') {
    const result = await checkVpermitBrowser({ claimUrl: type.claimUrl })
    await record({
      type,
      mode,
      ok: result.ok,
      httpStatus: result.httpStatus,
      message: result.message,
      durationMs: result.durationMs,
      now: args.now,
    })
    return {
      venueId: type.venueId,
      typeId: type.id,
      typeName: type.name,
      mode,
      ok: result.ok,
      message: result.message,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
    }
  }

  const result = await claimWithVpermit({
    claimUrl: type.claimUrl,
    contactName: 'FTP HEALTH CHECK',
    contactEmail: type.contactEmail,
    plate: type.healthPlate,
  })
  const ok = result.status === 'CONFIRMED' || result.status === 'ALREADY_CLAIMED'
  const message = ok ? `FULL CHECK: ${result.message}` : result.message
  const durationMs = Date.now() - started
  await record({
    type,
    mode,
    ok,
    httpStatus: result.httpStatus,
    message,
    durationMs,
    now: args.now,
  })
  return {
    venueId: type.venueId,
    typeId: type.id,
    typeName: type.name,
    mode,
    ok,
    message,
    httpStatus: result.httpStatus,
    durationMs,
  }
}

const typeInclude = {
  venue: { select: { timezone: true } },
} as const

export async function runFtpHealthCheck(args: {
  venueId: string
  typeId: string
  mode?: 'BROWSER' | 'FULL'
  now?: Date
  force?: boolean
}): Promise<FtpHealthRunResult | null> {
  const type = await prisma.ftpParkingType.findFirst({
    where: { id: args.typeId, venueId: args.venueId, deletedAt: null },
    include: typeInclude,
  })
  if (!type) return null
  return runOne(type, {
    mode: args.mode,
    now: args.now ?? new Date(),
    force: args.force ?? true,
  })
}

export async function runFtpHealthChecks(args?: {
  now?: Date
  force?: boolean
}): Promise<FtpHealthRunResult[]> {
  const now = args?.now ?? new Date()
  const types = await prisma.ftpParkingType.findMany({
    where: { isActive: true, deletedAt: null },
    include: typeInclude,
  })
  const results: FtpHealthRunResult[] = []
  for (const type of types) {
    const result = await runOne(type, { now, force: args?.force ?? false })
    if (result) results.push(result)
  }
  return results
}

export async function runFtpHealthChecksForVenue(args: {
  venueId: string
  mode?: 'BROWSER' | 'FULL'
  now?: Date
  force?: boolean
}): Promise<FtpHealthRunResult[]> {
  const now = args.now ?? new Date()
  const types = await prisma.ftpParkingType.findMany({
    where: { venueId: args.venueId, isActive: true, deletedAt: null },
    include: typeInclude,
  })
  const results: FtpHealthRunResult[] = []
  for (const type of types) {
    const result = await runOne(type, {
      mode: args.mode,
      now,
      force: args.force ?? false,
    })
    if (result) results.push(result)
  }
  return results
}
