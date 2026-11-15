// Server half of the parking metrics page. The pure aggregation lives in
// parking-metrics.ts.

import { prisma } from '@hospo-ops/db'
import {
  buildParkingMetrics,
  type ParkingMetricAttempt,
  type ParkingMetrics,
} from './parking-metrics'

export interface ParkingMetricsResult {
  metrics: ParkingMetrics
  range: {
    from: string | null
    to: string
    timezone: string
  }
}

export async function loadParkingMetrics(args: {
  venueId: string
  from: Date | null
  to: Date
}): Promise<ParkingMetricsResult> {
  const range = args.from
    ? { gte: args.from, lte: args.to }
    : { lte: args.to }

  const [
    venue,
    kioskRows,
    workerRows,
    claimRows,
    activePlates,
    entered,
    awaitingEntry,
    pending,
    approved,
    rejected,
    members,
    memberPlates,
    healthCounts,
    lastHealth,
  ] = await Promise.all([
    prisma.venue.findUnique({
      where: { id: args.venueId },
      select: { timezone: true },
    }),
    prisma.parkingKioskEvent.findMany({
      where: { venueId: args.venueId, deletedAt: null, createdAt: range },
      select: {
        createdAt: true,
        status: true,
        reason: true,
        durationMs: true,
      },
    }),
    prisma.parkingRegistration.findMany({
      where: { venueId: args.venueId, deletedAt: null, createdAt: range },
      select: {
        createdAt: true,
        status: true,
        responseSnippet: true,
      },
    }),
    prisma.ftpClaim.findMany({
      where: { venueId: args.venueId, deletedAt: null, createdAt: range },
      select: {
        createdAt: true,
        status: true,
        message: true,
        durationMs: true,
        typeId: true,
        typeName: true,
      },
    }),
    prisma.staffParkingPlate.count({
      where: { venueId: args.venueId, deletedAt: null, status: 'ACTIVE' },
    }),
    prisma.staffParkingPlate.count({
      where: {
        venueId: args.venueId,
        deletedAt: null,
        enteredInSystem: true,
        enteredAt: range,
      },
    }),
    prisma.staffParkingPlate.count({
      where: {
        venueId: args.venueId,
        deletedAt: null,
        status: 'ACTIVE',
        enteredInSystem: false,
      },
    }),
    prisma.staffParkingPlateRequest.count({
      where: { venueId: args.venueId, deletedAt: null, status: 'PENDING', createdAt: range },
    }),
    prisma.staffParkingPlateRequest.count({
      where: { venueId: args.venueId, deletedAt: null, status: 'APPROVED', createdAt: range },
    }),
    prisma.staffParkingPlateRequest.count({
      where: { venueId: args.venueId, deletedAt: null, status: 'REJECTED', createdAt: range },
    }),
    prisma.member.count({
      where: { venueId: args.venueId, deletedAt: null, isActive: true },
    }),
    prisma.memberPlate.count({
      where: { venueId: args.venueId, deletedAt: null, status: 'ACTIVE' },
    }),
    prisma.parkingHealthCheck.groupBy({
      by: ['ok'],
      where: { venueId: args.venueId, deletedAt: null, checkedAt: range },
      _count: { _all: true },
    }),
    prisma.parkingHealthCheck.findFirst({
      where: { venueId: args.venueId, deletedAt: null },
      orderBy: { checkedAt: 'desc' },
      select: { checkedAt: true, ok: true, message: true },
    }),
  ])

  const timezone = venue?.timezone || 'Pacific/Auckland'
  const kiosk90: ParkingMetricAttempt[] = kioskRows.map((row) => ({
    createdAt: row.createdAt,
    status: row.status,
    message: row.reason,
    durationMs: row.durationMs,
  }))
  const worker90: ParkingMetricAttempt[] = workerRows.map((row) => ({
    createdAt: row.createdAt,
    status: row.status,
    message: row.responseSnippet,
  }))
  const claims: ParkingMetricAttempt[] = claimRows.map((row) => ({
    createdAt: row.createdAt,
    status: row.status,
    message: row.message,
    durationMs: row.durationMs,
    typeId: row.typeId,
    typeName: row.typeName,
  }))

  const metrics = buildParkingMetrics({
    timezone,
    kiosk90,
    worker90,
    claims,
    staff: { activePlates, entered, awaitingEntry, pending, approved, rejected },
    members,
    memberPlates,
    health: {
      ok: healthCounts.find((row) => row.ok === true)?._count._all ?? 0,
      failed: healthCounts.find((row) => row.ok === false)?._count._all ?? 0,
      lastCheckAt: lastHealth?.checkedAt ?? null,
      lastCheckOk: lastHealth?.ok ?? null,
      message: lastHealth?.message ?? null,
    },
  })

  return {
    metrics,
    range: {
      from: args.from?.toISOString() ?? null,
      to: args.to.toISOString(),
      timezone,
    },
  }
}
