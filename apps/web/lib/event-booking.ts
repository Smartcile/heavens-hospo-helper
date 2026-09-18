// Server-only: push a BEO event downstream into the operational records.
//
// A confirmed event that has `pushToBookings` set becomes a CalendarEvent +
// Booking (seated on the service's table plan, else the event's chosen layout),
// and — when the menu/drinks blocks carry items — a manual pre-order WooOrder
// linked to that booking. Idempotent: pushing again updates in place rather
// than duplicating, so an operator can safely re-push after an edit.

import { prisma } from '@hospo-ops/db'
import { resolvePlacedFurniture } from '@/lib/furniture-server'
import { planSeatingOnTables, type ServicePlanTable } from '@/lib/service-seating'
import {
  seatFailureMessage,
  seatPartyOnServicePlan,
  setupOccupiedTableIds,
} from '@/lib/service-seating.server'
import { computeEventTotals, type EventBlockLike } from '@/lib/event-pricing'
import { logEventEvent } from '@/lib/events.server'

export type PushEventResult =
  | {
      ok: true
      bookingId: string
      orderId: string | null
      orderNumber: string | null
      seatedTableIds: string[]
      warnings: string[]
    }
  | { ok: false; reason: string }

export const PUSH_FAILURE_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'Event not found',
  NO_TIMES: 'Set a start and end time before pushing',
  NO_GUESTS: 'Set the guest count before pushing',
}

/** Sequential local reference (M-0001), same scheme as the manual orders route. */
async function nextManualOrderNumber(venueId: string): Promise<string> {
  const last = await prisma.wooOrder.findFirst({
    where: { venueId, orderNumber: { startsWith: 'M-' } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  })
  const n = last?.orderNumber ? parseInt(last.orderNumber.slice(2), 10) : 0
  return `M-${String((isNaN(n) ? 0 : n) + 1).padStart(4, '0')}`
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Seat a party on an arbitrary FloorPlanSetup (the event's chosen layout). */
async function seatOnSetup(opts: {
  setupId: string
  venueId: string
  date: Date
  startTime: string
  endTime: string
  partySize: number
}): Promise<{ ok: true; itemIds: string[] } | { ok: false; message: string }> {
  const setup = await prisma.floorPlanSetup.findFirst({
    where: {
      id: opts.setupId,
      deletedAt: null,
      floorPlan: { venueId: opts.venueId, deletedAt: null },
    },
    include: {
      items: {
        where: { deletedAt: null },
        include: { furnitureItem: true, tableProfile: true },
      },
    },
  })
  if (!setup) return { ok: false, message: 'LAYOUT NOT FOUND' }

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
  if (!plan.ok) return { ok: false, message: plan.reason }
  return { ok: true, itemIds: plan.itemIds }
}

/**
 * Push an event to bookings. `venueId` is the caller's scoped venue — the event
 * must belong to it.
 */
export async function pushEventToBookings(
  eventId: string,
  venueId: string,
): Promise<PushEventResult> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, venueId, deletedAt: null },
    include: {
      blocks: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      customer: { select: { id: true, name: true } },
      service: { select: { id: true, name: true, tablePlanSetupId: true } },
      setup: { select: { id: true, name: true, floorPlan: { select: { slug: true } } } },
    },
  })
  if (!event) return { ok: false, reason: 'NOT_FOUND' }
  if (!event.startTime || !event.endTime) return { ok: false, reason: 'NO_TIMES' }
  if (!event.guestCount || event.guestCount <= 0) return { ok: false, reason: 'NO_GUESTS' }

  const day = dateKey(event.eventDate)
  const contactName = (event.contactName || event.customer?.name || event.name).toUpperCase().trim()
  const warnings: string[] = []

  // ── 1. Calendar event (idempotent on venueId+source+uid) ──
  const startsAt = new Date(`${day}T${event.startTime}:00`)
  const endsAt = new Date(`${day}T${event.endTime}:00`)
  const calEvent = await prisma.calendarEvent.upsert({
    where: { venueId_source_uid: { venueId, source: 'MANUAL', uid: `event-${event.id}` } },
    update: {
      title: event.name,
      startsAt,
      endsAt,
      floorPlanSlug: event.setup?.floorPlan?.slug ?? null,
      floorPlanName: event.setup?.name ?? null,
      deletedAt: null,
    },
    create: {
      venueId,
      source: 'MANUAL',
      uid: `event-${event.id}`,
      title: event.name,
      description: event.eventType ?? undefined,
      startsAt,
      endsAt,
      floorPlanSlug: event.setup?.floorPlan?.slug ?? null,
      floorPlanName: event.setup?.name ?? null,
    },
  })

  // ── 2. Seating — service table plan first, else the chosen layout ──
  let seatedTableIds: string[] = []
  let seatingSetupId: string | null = event.setupId ?? null
  let floorPlanSlug: string | null = event.setup?.floorPlan?.slug ?? null

  if (event.service?.tablePlanSetupId) {
    const seat = await seatPartyOnServicePlan({
      serviceId: event.service.id,
      venueId,
      date: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      partySize: event.guestCount,
    })
    if (seat.ok) {
      seatedTableIds = seat.itemIds
      seatingSetupId = seat.setupId
      floorPlanSlug = seat.floorPlanSlug
    } else {
      warnings.push(`NOT SEATED: ${seatFailureMessage(seat.reason, event.guestCount)}`)
    }
  } else if (event.setupId) {
    const seat = await seatOnSetup({
      setupId: event.setupId,
      venueId,
      date: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      partySize: event.guestCount,
    })
    if (seat.ok) seatedTableIds = seat.itemIds
    else warnings.push(`NOT SEATED: ${seat.message}`)
  } else {
    warnings.push('NO SERVICE OR LAYOUT — BOOKING LEFT UNSEATED')
  }

  // ── 3. Booking (create or update in place) ──
  const bookingData = {
    venueId,
    date: event.eventDate,
    startTime: event.startTime,
    endTime: event.endTime,
    partySize: event.guestCount,
    contactName,
    contactPhone: event.contactPhone,
    contactEmail: event.contactEmail,
    source: 'EVENT' as const,
    status: 'CONFIRMED' as const,
    notes: event.notes,
    serviceId: event.serviceId,
    seatingSetupId,
    floorPlanSlug,
    calendarEventId: calEvent.id,
    deletedAt: null,
  }

  const booking = event.bookingId
    ? await prisma.booking
        .update({ where: { id: event.bookingId }, data: bookingData })
        .catch(() => prisma.booking.create({ data: bookingData }))
    : await prisma.booking.create({ data: bookingData })

  // Replace the table rows wholesale — BookingTable is a plain junction (no
  // soft delete), so the old assignments go and the fresh seating lands.
  await prisma.bookingTable.deleteMany({ where: { bookingId: booking.id } })
  if (seatedTableIds.length > 0) {
    await prisma.bookingTable.createMany({
      data: seatedTableIds.map((setupItemId) => ({ bookingId: booking.id, setupItemId })),
    })
  }

  // ── 4. Pre-order from the menu / drinks blocks ──
  let orderId: string | null = null
  let orderNumber: string | null = null

  const menuItems = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, name: true, price: true },
  })
  const totals = computeEventTotals(
    event.blocks as unknown as EventBlockLike[],
    menuItems,
    event.depositAmount,
  )

  if (totals.lines.length > 0) {
    const existing = await prisma.wooOrder.findFirst({
      where: { bookingId: booking.id, venueId, deletedAt: null },
      select: { id: true, orderNumber: true },
    })

    const orderData = {
      venueId,
      source: 'MANUAL' as const,
      customerId: event.customerId,
      menuId: event.menuId,
      serviceId: event.serviceId,
      bookingId: booking.id,
      customerName: contactName,
      customerEmail: event.contactEmail,
      customerPhone: event.contactPhone,
      partySize: event.guestCount,
      serviceDate: event.eventDate,
      serviceTime: event.startTime,
      fulfillmentType: 'DINE_IN' as const,
      totalAmount: totals.subtotal,
      notes: `BEO PRE-ORDER — ${event.name}`,
    }
    const lineCreate = totals.lines.map((l) => ({
      menuItemId: l.menuItemId,
      qty: l.qty,
      unitPrice: l.unitPrice,
    }))

    if (existing) {
      await prisma.wooOrderItem.deleteMany({ where: { orderId: existing.id } })
      await prisma.wooOrder.update({
        where: { id: existing.id },
        data: { ...orderData, items: { create: lineCreate } },
      })
      orderId = existing.id
      orderNumber = existing.orderNumber
    } else {
      const created = await prisma.wooOrder.create({
        data: {
          ...orderData,
          orderNumber: await nextManualOrderNumber(venueId),
          items: { create: lineCreate },
        },
      })
      orderId = created.id
      orderNumber = created.orderNumber
    }
  }

  // ── 5. Link back + log ──
  await prisma.event.update({
    where: { id: event.id },
    data: { bookingId: booking.id, calendarEventId: calEvent.id },
  })
  await logEventEvent(
    event.id,
    'PUSHED',
    `PUSHED TO BOOKINGS${orderNumber ? ` + PRE-ORDER ${orderNumber}` : ''}${
      warnings.length ? ` — ${warnings.join('; ')}` : ''
    }`,
  )

  return { ok: true, bookingId: booking.id, orderId, orderNumber, seatedTableIds, warnings }
}
