import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { planAutoSeat } from '@/lib/auto-seat'
import type { AutoSeatProfile } from '@/lib/auto-seat'

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
    source, notes, setupId, floorPlanSlug,
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

  // Auto-seat: fetch setup with tables and run bin-packing
  if (setupId && partySize > 0) {
    const setup = await prisma.floorPlanSetup.findFirst({
      where: { id: setupId, deletedAt: null },
      include: {
        items: {
          where: { deletedAt: null },
          include: { tableProfile: true },
        },
      },
    })

    if (setup) {
      // Build profiles from the setup's existing tables
      const profileMap = new Map<string, AutoSeatProfile>()
      const usedNumbers: string[] = []
      for (const item of setup.items) {
        const tp = item.tableProfile
        if (!profileMap.has(tp.id)) {
          profileMap.set(tp.id, {
            id: tp.id,
            capacity: tp.capacity,
            chairCount: tp.chairCount,
            width: tp.width,
            depth: tp.depth,
            tableNumbers: Array.isArray((tp as any).tableNumbers) ? (tp as any).tableNumbers : [],
          })
        }
        if (item.assignedNumber) usedNumbers.push(item.assignedNumber)
      }

      // Also fetch booked tables for this date/time so we don't double-book
      const conflictingBookings = await prisma.booking.findMany({
        where: {
          deletedAt: null,
          venueId: scopedVenueId,
          date: bookingDate,
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        include: { tables: { select: { setupItemId: true } } },
      })

      const bookedTableIds = new Set<string>()
      for (const cb of conflictingBookings) {
        for (const t of cb.tables) bookedTableIds.add(t.setupItemId)
      }

      // Get all available table profiles considering only unbooked tables
      const bookedNumbers = new Set(usedNumbers)
      for (const cb of conflictingBookings) {
        for (const t of cb.tables) {
          const bookedItem = setup.items.find((i) => i.id === t.setupItemId)
          if (bookedItem?.assignedNumber) bookedNumbers.add(bookedItem.assignedNumber)
        }
      }

      // Rebuild profiles with filtered numbers
      const filteredProfiles: AutoSeatProfile[] = []
      for (const item of setup.items) {
        if (bookedTableIds.has(item.id)) continue
        const tp = item.tableProfile
        const profile = profileMap.get(tp.id)
        if (!profile) continue
        // Create a per-table profile with this table's specific number
        filteredProfiles.push({
          ...profile,
          tableNumbers: item.assignedNumber ? [item.assignedNumber] : [],
        })
      }

      // Remove duplicate profiles for items without numbers (count free inventory)
      const dedupedProfiles: AutoSeatProfile[] = []
      for (const p of filteredProfiles) {
        if (p.tableNumbers && p.tableNumbers.length > 0) {
          dedupedProfiles.push(p)
        } else {
          const existing = dedupedProfiles.find((d) => d.id === p.id && (!d.tableNumbers || d.tableNumbers.length === 0))
          if (existing) {
            existing.capacity += p.capacity
            existing.chairCount += p.chairCount
          } else {
            dedupedProfiles.push({ ...p })
          }
        }
      }

      const placements = planAutoSeat(parseInt(String(partySize)), dedupedProfiles)

      if (placements.length > 0) {
        // Create CalendarEvent for calendar display
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

        // Create FloorPlanSetup for the booking's table layout
        const bookingSetup = await prisma.floorPlanSetup.create({
          data: {
            floorPlanId: setup.floorPlanId,
            name: eventTitle,
            calendarEventId: calEvent.id,
          },
        })

        // Create SetupItems from placements
        const createdItems: { id: string }[] = []
        for (const placement of placements) {
          const si = await prisma.setupItem.create({
            data: {
              setupId: bookingSetup.id,
              tableProfileId: placement.profileId,
              x: placement.x,
              y: placement.y,
              rotation: 0,
              assignedNumber: placement.assignedNumber,
              label: placement.assignedNumber || undefined,
            },
          })
          createdItems.push(si)
        }

        // Group if multiple tables
        if (createdItems.length >= 2) {
          const group = await prisma.tableGroup.create({
            data: { setupId: bookingSetup.id },
          })
          for (const si of createdItems) {
            await prisma.setupItem.update({
              where: { id: si.id },
              data: { tableGroupId: group.id },
            })
          }
        }

  bookingData.calendarEventId = calEvent.id
  bookingData.seatingSetupId = bookingSetup.id
  // Link booking to tables
  bookingData.tables = { create: createdItems.map((si) => ({ setupItemId: si.id })) }
      }
    }
  }

  const booking = await prisma.booking.create({
    data: bookingData,
    include: { tables: true },
  })

  return NextResponse.json(booking, { status: 201 })
}
