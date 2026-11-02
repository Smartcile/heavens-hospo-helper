// Server half of service-table-plan seating. The plan lives on the Service
// (`tablePlanSetupId`); a booking/order for that service seats against the
// layout's physical tables, competing only with other bookings seated on the
// SAME setup (a layout runs one at a time, so tables on other setups are
// different physical spots and never conflict).

import { prisma } from '@hospo-ops/db'
import { resolvePlacedFurniture } from '@/lib/furniture-server'
import {
  planSeatingOnTables,
  type SeatPlanFailure,
  type ServicePlanTable,
} from '@/lib/service-seating'

export type ServicePlanSeatFailure = 'NO_PLAN' | SeatPlanFailure

export type ServicePlanSeat =
  | {
      ok: true
      setupId: string
      setupName: string
      floorPlanSlug: string | null
      itemIds: string[]
    }
  | { ok: false; reason: ServicePlanSeatFailure }

function timeToMins(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Table ids of live bookings seated on `setupId` that overlap the window. */
export async function setupOccupiedTableIds(opts: {
  venueId: string
  setupId: string
  date: Date
  startTime: string
  endTime: string
}): Promise<Set<string>> {
  const start = timeToMins(opts.startTime)
  const end = timeToMins(opts.endTime)

  const bookings = await prisma.booking.findMany({
    where: {
      deletedAt: null,
      venueId: opts.venueId,
      date: opts.date,
      seatingSetupId: opts.setupId,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    include: { tables: { select: { setupItemId: true } } },
  })

  const occupied = new Set<string>()
  for (const b of bookings) {
    const bStart = timeToMins(b.startTime)
    const bEnd = timeToMins(b.endTime)
    if (bStart < end && bEnd > start) {
      for (const t of b.tables) occupied.add(t.setupItemId)
    }
  }
  return occupied
}

/**
 * Seat a party on a service's table plan.
 * - `NO_PLAN` — the service has no table plan (or it was deleted): the caller
 *   falls back to its non-seating behaviour.
 * - `NO_TABLES` / `ALL_OCCUPIED` / `NO_FIT` — the plan exists but cannot seat
 *   this party; the caller decides (reject the booking).
 */
export async function seatPartyOnServicePlan(opts: {
  serviceId: string
  venueId: string
  date: Date
  startTime: string
  endTime: string
  partySize: number
}): Promise<ServicePlanSeat> {
  const service = await prisma.service.findFirst({
    where: { id: opts.serviceId, venueId: opts.venueId, deletedAt: null },
    include: {
      tablePlanSetup: {
        where: { deletedAt: null },
        include: {
          floorPlan: { select: { slug: true } },
          items: {
            where: { deletedAt: null },
            include: { furnitureItem: true, tableProfile: true },
          },
        },
      },
    },
  })

  const setup = service?.tablePlanSetup
  if (!setup) return { ok: false, reason: 'NO_PLAN' }

  const tables: ServicePlanTable[] = setup.items.flatMap((item) => {
    const f = resolvePlacedFurniture(item)
    if (!f) return []
    return [{
      id: item.id,
      furnitureKey: f.id,
      capacity: item.tableProfile?.capacity ?? f.chairCount,
      chairCount: f.chairCount,
      width: f.width,
      depth: f.depth,
      assignedNumber: item.assignedNumber,
    }]
  })

  const occupied = await setupOccupiedTableIds({
    venueId: opts.venueId,
    setupId: setup.id,
    date: opts.date,
    startTime: opts.startTime,
    endTime: opts.endTime,
  })

  const plan = planSeatingOnTables(tables, occupied, opts.partySize)
  if (!plan.ok) return plan

  return {
    ok: true,
    setupId: setup.id,
    setupName: setup.name,
    floorPlanSlug: setup.floorPlan.slug,
    itemIds: plan.itemIds,
  }
}

/** Human-readable failure for API 409/422 responses. */
export function seatFailureMessage(reason: ServicePlanSeatFailure, partySize: number): string {
  switch (reason) {
    case 'NO_TABLES': return 'This service has no table plan with tables'
    case 'ALL_OCCUPIED': return 'All tables are already booked for this time'
    case 'NO_FIT': return `No tables can seat ${partySize} guests`
    case 'NO_PLAN': return 'This service has no table plan'
  }
}
