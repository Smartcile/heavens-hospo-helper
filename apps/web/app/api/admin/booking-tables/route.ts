import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolvePlacedFurniture } from '@/lib/furniture-server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId') ?? (session.user.role === 'MANAGER' ? session.user.venueId : undefined)
  const date = searchParams.get('date')
  if (!venueId) return NextResponse.json({ error: 'venueId required' }, { status: 400 })

  const [setups, sections, bookings] = await Promise.all([
    prisma.floorPlanSetup.findMany({
      where: { deletedAt: null, floorPlan: { venueId, deletedAt: null } },
      include: {
        items: {
          where: { deletedAt: null },
          include: {
            furnitureItem: {
              select: {
                id: true, name: true, elementWidth: true, elementDepth: true,
                elementShape: true, elementVertices: true, defaultColour: true,
                defaultChairCount: true, seatingDensity: true, maxHeadChairs: true,
              },
            },
            tableProfile: { select: { id: true, name: true, capacity: true, colour: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.section.findMany({
      where: { deletedAt: null, venueId },
      select: { id: true, name: true, colour: true, department: { select: { id: true, name: true, colour: true } } },
    }),
    date ? prisma.booking.findMany({
      where: { deletedAt: null, venueId, date: new Date(date), status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      select: { id: true, startTime: true, endTime: true, partySize: true, contactName: true, status: true, tables: { select: { setupItemId: true } } },
    }) : Promise.resolve([]),
  ])

  const sectionMap = new Map(sections.map((s) => [s.id, s]))

  // Build flat table list grouped by section
  interface TableRow {
    id: string
    assignedNumber: string | null
    label: string | null
    profile: { id: string; name: string; capacity: number; colour: string | null }
    section: { id: string; name: string; colour: string | null; department: { id: string; name: string; colour: string | null } } | null
    setupId: string
    setupName: string
  }

  const tables: TableRow[] = []
  for (const setup of setups) {
    for (const item of setup.items) {
      const f = resolvePlacedFurniture(item)
      // No furniture means nothing to seat anyone at — skip rather than render
      // a nameless row in the booking grid.
      if (!f) continue
      const sec = item.sectionId ? sectionMap.get(item.sectionId) : null
      tables.push({
        id: item.id,
        assignedNumber: item.assignedNumber,
        label: item.label,
        profile: {
          id: f.id,
          name: f.name,
          capacity: item.tableProfile?.capacity ?? f.chairCount,
          colour: f.colour,
        },
        section: sec ? { id: sec.id, name: sec.name, colour: sec.colour, department: sec.department } : null,
        setupId: setup.id,
        setupName: setup.name,
      })
    }
  }

  // Build booking-to-table mapping for the grid
  interface BookingGrid {
    id: string
    startTime: string
    endTime: string
    partySize: number
    contactName: string
    status: string
    tableIds: string[]
  }

  const gridBookings: BookingGrid[] = bookings.map((b) => ({
    id: b.id,
    startTime: b.startTime,
    endTime: b.endTime,
    partySize: b.partySize,
    contactName: b.contactName,
    status: b.status,
    tableIds: b.tables.map((t) => t.setupItemId),
  }))

  return NextResponse.json({ tables, bookings: gridBookings })
}
