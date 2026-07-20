import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { checkAvailability } from '@/lib/booking-availability'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const startTime = searchParams.get('startTime')
  const endTime = searchParams.get('endTime')
  const partySize = parseInt(searchParams.get('partySize') || '0')
  const venueId = searchParams.get('venueId') ?? (session.user.role === 'MANAGER' ? session.user.venueId : undefined)

  if (!date || !startTime || !endTime || !partySize || !venueId) {
    return NextResponse.json({ error: 'date, startTime, endTime, partySize, and venueId are required' }, { status: 400 })
  }

  const slot = { date, startTime, endTime }

  const [existingBookings, setups] = await Promise.all([
    prisma.booking.findMany({
      where: {
        deletedAt: null,
        venueId,
        date: new Date(date),
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        partySize: true,
        tables: { select: { setupItemId: true } },
      },
    }),
    prisma.floorPlanSetup.findMany({
      where: { deletedAt: null, floorPlan: { venueId, deletedAt: null } },
      include: {
        items: {
          where: { deletedAt: null },
          include: {
            tableProfile: {
              select: { id: true, name: true, capacity: true, chairCount: true, width: true, depth: true, colour: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
  ])

  // Convert DB dates to strings for the pure availability check
  const bookings = existingBookings.map((b) => ({
    id: b.id,
    date: typeof b.date === 'string' ? b.date : (b.date as Date).toISOString().slice(0, 10),
    startTime: b.startTime,
    endTime: b.endTime,
    partySize: b.partySize,
    tables: b.tables,
  }))

  const setupInfos = setups.map((s) => ({
    id: s.id,
    name: s.name,
    tables: s.items.map((i) => ({
      id: i.id,
      profile: i.tableProfile,
      assignedNumber: i.assignedNumber,
    })),
  }))

  const results = checkAvailability(slot, partySize, setupInfos, bookings)

  return NextResponse.json({
    slot,
    partySize,
    setups: results.map((r) => ({
      id: r.setup.id,
      name: r.setup.name,
      available: r.available,
      availableTables: r.availableTableCount,
      totalCapacity: r.totalCapacity,
    })),
  })
}
