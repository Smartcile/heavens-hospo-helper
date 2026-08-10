import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolvePlacedFurniture } from '@/lib/furniture-server'
import {
  planSeatingOnTables,
  type ServicePlanTable,
} from '@/lib/service-seating'
import { seatPartyOnServicePlan, seatFailureMessage } from '@/lib/service-seating.server'
import { bookableSlotsForService } from '@/lib/service-windows'

function timeToMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const search = searchParams.get('search')
  const deletedOnly = searchParams.get('deleted') === '1'
  const venueId = searchParams.get('venueId') ?? (session.user.role === 'MANAGER' ? session.user.venueId : undefined)

  // `deleted=1` lists soft-deleted bookings for the recover flow — venue-wide
  // (any date), newest deletion first.
  const where: any = deletedOnly ? { deletedAt: { not: null } } : { deletedAt: null }
  if (date) where.date = new Date(date)
  if (venueId) where.venueId = venueId
  if (session.user.role === 'MANAGER') where.venueId = session.user.venueId
  if (search) {
    where.OR = [
      { contactName: { contains: search, mode: 'insensitive' } },
      { contactPhone: { contains: search } },
      { contactEmail: { contains: search, mode: 'insensitive' } },
    ]
  }

  const bookings = await prisma.booking.findMany({
    where,
    include: {
      tables: { include: { setupItem: { select: { id: true, assignedNumber: true, label: true } } } },
      service: { select: { id: true, name: true } },
      orders: {
        where: { deletedAt: null },
        select: {
          id: true,
          orderNumber: true,
          source: true,
          items: {
            select: { id: true, menuItemId: true, productName: true, qty: true, unitPrice: true, allergenNote: true, customerNote: true },
          },
        },
      },
    },
    orderBy: deletedOnly ? [{ date: 'desc' }, { startTime: 'asc' }] : [{ date: 'asc' }, { startTime: 'asc' }],
  })

  return NextResponse.json(bookings)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    date, startTime, endTime, partySize, contactName, contactPhone, contactEmail,
    source, notes, setupId, floorPlanSlug, tableIds, serviceId,
  } = body

  if (!date || !startTime || !endTime || !partySize || !contactName) {
    return NextResponse.json({ error: 'date, startTime, endTime, partySize, and contactName are required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : body.venueId
  if (!scopedVenueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  // Bookings are made against a dated service — its windows define the only
  // times a booking can be placed (the modal's clickable boxes show exactly
  // these). The internal order/booking paths create via Prisma directly and
  // are unaffected.
  if (!serviceId) return NextResponse.json({ error: 'serviceId is required' }, { status: 400 })

  const bookingStartMins = timeToMins(startTime)
  const bookingEndMins = timeToMins(endTime)

  const service = await prisma.service.findFirst({
    where: { id: serviceId, venueId: scopedVenueId, isActive: true, deletedAt: null },
    select: {
      slots: { select: { dayOfWeek: true, startTime: true, endTime: true } },
      exceptions: { select: { date: true, closed: true, startTime: true, endTime: true } },
      bookingIntervalMinutes: true,
      bookableTimes: true,
    },
  })
  if (!service) return NextResponse.json({ error: 'Service not found or inactive' }, { status: 400 })

  // The service's bookable slots are the only start times accepted — the
  // window may be the full service length (walk-ins → last calls → clock-out),
  // while bookability is the interval/times configured on the service.
  const slots = bookableSlotsForService({
    slots: service.slots,
    exceptions: service.exceptions.map((e) => ({ ...e, date: e.date.toISOString().slice(0, 10) })),
    bookingIntervalMinutes: service.bookingIntervalMinutes,
    bookableTimes: Array.isArray(service.bookableTimes) ? service.bookableTimes as string[] : null,
  }, String(date))
  const slot = slots.find((s) => s.startMins === bookingStartMins)
  if (!slot) {
    return NextResponse.json({ error: 'That time is not bookable for this service' }, { status: 409 })
  }
  if (bookingEndMins > slot.endMins) {
    return NextResponse.json({ error: 'Booking end time is outside the service window' }, { status: 409 })
  }

  const bookingDate = new Date(date)
  const bookingData: any = {
    venueId: scopedVenueId,
    date: bookingDate,
    startTime, endTime,
    partySize: parseInt(String(partySize)),
    contactName: String(contactName).toUpperCase().trim(),
    contactPhone: contactPhone || null,
    contactEmail: contactEmail || null,
    source: source || 'PHONE',
    status: 'CONFIRMED',
    notes: notes || null,
    floorPlanSlug: floorPlanSlug || null,
    serviceId: serviceId || null,
  }

  // Manual table selection — use directly, skip auto-seat. Still guard against
  // double-booking: the tables the operator picked may already be held by an
  // overlapping booking (the UI filters, but a stale screen or a second admin
  // must not double-book a table).
  if (Array.isArray(tableIds) && tableIds.length > 0) {
    const slotStart = timeToMins(startTime)
    const slotEnd = timeToMins(endTime)

    const overlappingBookings = await prisma.booking.findMany({
      where: {
        deletedAt: null,
        venueId: scopedVenueId,
        date: bookingDate,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: { tables: { select: { setupItemId: true } } },
    })

    const occupiedIds = new Set<string>()
    for (const b of overlappingBookings) {
      const bStart = timeToMins(b.startTime)
      const bEnd = timeToMins(b.endTime)
      if (bStart < slotEnd && bEnd > slotStart) {
        for (const t of b.tables) occupiedIds.add(t.setupItemId)
      }
    }

    const clash = (tableIds as string[]).find((id) => occupiedIds.has(id))
    if (clash) {
      return NextResponse.json({ error: 'One or more selected tables are already booked for this time' }, { status: 409 })
    }

    const setup = await prisma.floorPlanSetup.findFirst({
      where: { id: setupId, deletedAt: null },
      select: { name: true, floorPlan: { select: { slug: true } } },
    })

    const eventTitle = `${contactName.toUpperCase().trim()} — ${partySize} PAX`
    const calEvent = await prisma.calendarEvent.create({
      data: {
        venueId: scopedVenueId,
        source: 'MANUAL',
        uid: `booking-${crypto.randomUUID()}`,
        title: eventTitle,
        startsAt: new Date(`${date}T${startTime}:00`),
        endsAt: new Date(`${date}T${endTime}:00`),
        floorPlanSlug: floorPlanSlug || setup?.floorPlan?.slug || undefined,
        floorPlanName: setup?.name,
      },
    })

    bookingData.calendarEventId = calEvent.id
    bookingData.seatingSetupId = setupId || null
    bookingData.tables = { create: tableIds.map((id: string) => ({ setupItemId: id })) }
  }

  // Auto-seat: use existing tables from the selected setup
  if (!(Array.isArray(tableIds) && tableIds.length > 0) && setupId && partySize > 0) {
    const setup = await prisma.floorPlanSetup.findFirst({
      where: { id: setupId, deletedAt: null },
      include: {
        items: {
          where: { deletedAt: null },
          include: { furnitureItem: true, tableProfile: true },
        },
      },
    })

    if (!setup || setup.items.length === 0) {
      return NextResponse.json({ error: 'Selected setup has no tables' }, { status: 400 })
    }

    const slotStart = timeToMins(startTime)
    const slotEnd = timeToMins(endTime)

    const overlappingBookings = await prisma.booking.findMany({
      where: {
        deletedAt: null,
        venueId: scopedVenueId,
        date: bookingDate,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      include: { tables: { select: { setupItemId: true } } },
    })

    const bookedTableIds = new Set<string>()
    for (const b of overlappingBookings) {
      const bStart = timeToMins(b.startTime)
      const bEnd = timeToMins(b.endTime)
      if (bStart < slotEnd && bEnd > slotStart) {
        for (const t of b.tables) bookedTableIds.add(t.setupItemId)
      }
    }

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

    const plan = planSeatingOnTables(tables, bookedTableIds, parseInt(String(partySize)))
    if (!plan.ok) {
      const message = plan.reason === 'NO_FIT'
        ? `No tables can seat ${partySize} guests`
        : 'No tables available for this time slot'
      return NextResponse.json({ error: message }, { status: 409 })
    }

    const eventTitle = `${contactName.toUpperCase().trim()} — ${partySize} PAX`
    const calEvent = await prisma.calendarEvent.create({
      data: {
        venueId: scopedVenueId,
        source: 'MANUAL',
        uid: `booking-${crypto.randomUUID()}`,
        title: eventTitle,
        startsAt: new Date(`${date}T${startTime}:00`),
        endsAt: new Date(`${date}T${endTime}:00`),
        floorPlanSlug: floorPlanSlug || undefined,
        floorPlanName: setup.name,
      },
    })

    bookingData.calendarEventId = calEvent.id
    bookingData.seatingSetupId = setupId
    bookingData.tables = { create: plan.itemIds.map((id) => ({ setupItemId: id })) }
  }

  // Service table plan: when the booking is for a service with a table plan
  // and no explicit setup/table choice was made, seat against the plan's
  // physical tables. A plan that cannot seat the party rejects the booking —
  // the venue configured the plan, so its capacity is the constraint.
  if (!(Array.isArray(tableIds) && tableIds.length > 0) && !setupId && serviceId && partySize > 0) {
    const seat = await seatPartyOnServicePlan({
      serviceId,
      venueId: scopedVenueId,
      date: bookingDate,
      startTime, endTime,
      partySize: parseInt(String(partySize)),
    })

    if (seat.ok) {
      const eventTitle = `${contactName.toUpperCase().trim()} — ${partySize} PAX`
      const calEvent = await prisma.calendarEvent.create({
        data: {
          venueId: scopedVenueId,
          source: 'MANUAL',
          uid: `booking-${crypto.randomUUID()}`,
          title: eventTitle,
          startsAt: new Date(`${date}T${startTime}:00`),
          endsAt: new Date(`${date}T${endTime}:00`),
          floorPlanSlug: seat.floorPlanSlug || undefined,
          floorPlanName: seat.setupName,
        },
      })

      bookingData.calendarEventId = calEvent.id
      bookingData.seatingSetupId = seat.setupId
      bookingData.tables = { create: seat.itemIds.map((id) => ({ setupItemId: id })) }
    } else if (seat.reason !== 'NO_PLAN') {
      return NextResponse.json({ error: seatFailureMessage(seat.reason, parseInt(String(partySize))) }, { status: 409 })
    }
  }

  const booking = await prisma.booking.create({
    data: bookingData,
    include: { tables: true },
  })

  return NextResponse.json(booking, { status: 201 })
}
