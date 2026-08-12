import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { seatPartyOnServicePlan } from '@/lib/service-seating.server'
import { slotEndForTime, addMinutesHHMM, type ServiceScheduleInput } from '@/lib/service-schedule'
import { serviceWindowsForDate } from '@/lib/service-windows'

/*
 * Create the table reservation for a dine-in order from the order detail
 * popout. The order's service date/time/party size drive the booking; the
 * service (the order's own, or the active one whose window covers the slot)
 * seats it against its table plan when one exists — same rules as a Woo
 * order's auto-booking. Un-seatable plans leave the booking unseated rather
 * than rejecting the operator's action.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await prisma.wooOrder.findFirst({ where: { id: params.id, deletedAt: null } })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && order.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (order.bookingId) {
    return NextResponse.json({ error: 'This order already has a booking' }, { status: 409 })
  }
  if (order.fulfillmentType !== 'DINE_IN') {
    return NextResponse.json({ error: 'Only dine-in orders can have a booking' }, { status: 400 })
  }
  if (!order.serviceDate || !order.serviceTime) {
    return NextResponse.json({ error: 'Set the service date and time first' }, { status: 400 })
  }
  if (!order.partySize || order.partySize <= 0) {
    return NextResponse.json({ error: 'Set a party size first' }, { status: 400 })
  }

  const serviceDate = order.serviceDate
  const serviceTime = order.serviceTime
  const dateKey = serviceDate.toISOString().slice(0, 10)

  // The order's own service — or the active service whose window covers the
  // slot (an order synced before services were linked has no serviceId).
  let serviceId: string | null = order.serviceId
  if (serviceId) {
    const exists = await prisma.service.findFirst({
      where: { id: serviceId, venueId: order.venueId, isActive: true, deletedAt: null },
      select: { id: true },
    })
    if (!exists) serviceId = null
  }
  if (!serviceId) {
    const candidates = await prisma.service.findMany({
      where: { venueId: order.venueId, isActive: true, deletedAt: null },
      select: {
        id: true,
        slots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
        exceptions: { select: { date: true, closed: true, startTime: true, endTime: true } },
      },
    })
    const timeMins = (() => {
      const [h, m] = serviceTime.split(':').map(Number)
      return h * 60 + m
    })()
    const covering = candidates.find((c) =>
      serviceWindowsForDate(
        [{ ...c, exceptions: c.exceptions.map((e) => ({ ...e, date: e.date.toISOString().slice(0, 10) })) }],
        dateKey,
      ).some((w) => timeMins >= w.startMins && timeMins < w.endMins),
    )
    if (covering) serviceId = covering.id
  }

  // Booking end: the matching slot's end time, else 90 minutes (same default
  // as the Woo order auto-booking path).
  let endTime = addMinutesHHMM(serviceTime, 90)
  if (serviceId) {
    const svc = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { slots: true, exceptions: true },
    })
    if (svc) {
      const input: ServiceScheduleInput = {
        slots: svc.slots.map((s) => ({
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          maxCovers: s.maxCovers,
        })),
        exceptions: svc.exceptions.map((e) => ({
          date: e.date.toISOString().slice(0, 10),
          closed: e.closed,
          startTime: e.startTime,
          endTime: e.endTime,
          maxCovers: e.maxCovers,
        })),
      }
      endTime = slotEndForTime(input, dateKey, serviceTime) ?? endTime
    }
  }

  const bookingData: Record<string, unknown> = {
    venueId: order.venueId,
    date: serviceDate,
    startTime: serviceTime,
    endTime,
    partySize: order.partySize,
    contactName: order.customerName ?? 'WOO ORDER',
    contactPhone: order.customerPhone,
    contactEmail: order.customerEmail,
    source: order.source === 'WOO' ? 'WOOCOMMERCE' : 'PHONE',
    status: 'CONFIRMED',
    serviceId,
  }

  // Seat against the service's table plan when it has one; a plan that
  // cannot seat the party leaves the booking unseated for manual seating.
  if (serviceId) {
    const seat = await seatPartyOnServicePlan({
      serviceId,
      venueId: order.venueId,
      date: serviceDate,
      startTime: serviceTime,
      endTime,
      partySize: order.partySize,
    })
    if (seat.ok) {
      const calEvent = await prisma.calendarEvent.create({
        data: {
          venueId: order.venueId,
          source: 'MANUAL',
          uid: `booking-${crypto.randomUUID()}`,
          title: `${(order.customerName ?? 'ORDER').toUpperCase()} — ${order.partySize} PAX`,
          startsAt: new Date(`${dateKey}T${serviceTime}:00`),
          endsAt: new Date(`${dateKey}T${endTime}:00`),
          floorPlanSlug: seat.floorPlanSlug || undefined,
          floorPlanName: seat.setupName,
        },
      })
      bookingData.calendarEventId = calEvent.id
      bookingData.seatingSetupId = seat.setupId
      bookingData.tables = { create: seat.itemIds.map((id) => ({ setupItemId: id })) }
    }
  }

  const booking = await prisma.booking.create({
    data: bookingData as any,
    include: { tables: { include: { setupItem: { select: { assignedNumber: true } } } } },
  })

  await prisma.wooOrder.update({
    where: { id: params.id },
    data: {
      bookingId: booking.id,
      ...(bookingData.calendarEventId ? { calendarEventId: bookingData.calendarEventId } : {}),
    },
  })

  return NextResponse.json(booking, { status: 201 })
}
