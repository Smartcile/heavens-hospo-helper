import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { planAutoSeat } from '@/lib/auto-seat'
import type { AutoSeatProfile } from '@/lib/auto-seat'

function timeToMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const search = searchParams.get('search')
  const venueId = searchParams.get('venueId') ?? (session.user.role === 'MANAGER' ? session.user.venueId : undefined)

  const where: any = { deletedAt: null }
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
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  return NextResponse.json(bookings)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    date, startTime, endTime, partySize, contactName, contactPhone, contactEmail,
    source, notes, setupId, floorPlanSlug, tableIds,
  } = body

  if (!date || !startTime || !endTime || !partySize || !contactName) {
    return NextResponse.json({ error: 'date, startTime, endTime, partySize, and contactName are required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : body.venueId
  if (!scopedVenueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

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
  }

  // Manual table selection — use directly, skip auto-seat
  if (Array.isArray(tableIds) && tableIds.length > 0) {
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
          include: { tableProfile: true },
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

    const availableItems = setup.items.filter((i) => !bookedTableIds.has(i.id))

    if (availableItems.length === 0) {
      return NextResponse.json({ error: 'No tables available for this time slot' }, { status: 409 })
    }

    const seatProfiles: AutoSeatProfile[] = availableItems.map((item) => ({
      id: item.tableProfile.id,
      capacity: item.tableProfile.capacity,
      chairCount: item.tableProfile.chairCount,
      width: item.tableProfile.width,
      depth: item.tableProfile.depth,
      tableNumbers: item.assignedNumber ? [item.assignedNumber] : [],
    }))

    const placements = planAutoSeat(parseInt(String(partySize)), seatProfiles)

    if (placements.length === 0) {
      return NextResponse.json({ error: `No tables can seat ${partySize} guests` }, { status: 409 })
    }

    const reservedItemIds: string[] = []
    const usedItemIds = new Set<string>()

    for (const placement of placements) {
      let matched: typeof availableItems[number] | undefined

      if (placement.assignedNumber) {
        matched = availableItems.find(
          (i) =>
            i.tableProfileId === placement.profileId &&
            i.assignedNumber === placement.assignedNumber &&
            !usedItemIds.has(i.id),
        )
      }

      if (!matched) {
        matched = availableItems.find(
          (i) =>
            i.tableProfileId === placement.profileId &&
            !usedItemIds.has(i.id),
        )
      }

      if (matched) {
        reservedItemIds.push(matched.id)
        usedItemIds.add(matched.id)
      }
    }

    if (reservedItemIds.length === 0) {
      return NextResponse.json({ error: `No tables can seat ${partySize} guests` }, { status: 409 })
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
    bookingData.tables = { create: reservedItemIds.map((id) => ({ setupItemId: id })) }
  }

  const booking = await prisma.booking.create({
    data: bookingData,
    include: { tables: true },
  })

  return NextResponse.json(booking, { status: 201 })
}
