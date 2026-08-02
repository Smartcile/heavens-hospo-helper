import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string; setupId: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.floorPlanSetup.findFirst({
    where: { id: params.setupId, deletedAt: null },
    include: {
      items: {
        where: { deletedAt: null, isActive: true },
        include: {
          furnitureItem: {
            select: {
              id: true, name: true, elementWidth: true, elementDepth: true,
              elementShape: true, elementVertices: true, defaultColour: true,
              defaultChairCount: true, seatingDensity: true, maxHeadChairs: true,
              chairItemId: true,
            },
          },
          // Still selected so a layout saved before the furniture migration
          // keeps rendering instead of collapsing to zero-size tables.
          tableProfile: { select: { id: true, name: true, width: true, depth: true, colour: true, chairCount: true } },
        },
        orderBy: { sortOrder: 'asc' },
      },
      groups: {
        where: { deletedAt: null },
        include: { _count: { select: { items: true } } },
      },
    },
  })
  if (!setup) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(setup)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.floorPlanSetup.findFirst({
    where: { id: params.setupId, deletedAt: null },
    include: { floorPlan: { select: { venueId: true } } },
  })
  if (!setup) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && setup.floorPlan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).toUpperCase().trim()
  if (body.eventDate !== undefined) data.eventDate = body.eventDate ? new Date(body.eventDate) : null
  if (body.calendarEventId !== undefined) data.calendarEventId = body.calendarEventId
  if (body.notes !== undefined) data.notes = body.notes

  // Promoting a layout to default demotes the incumbent in the same
  // transaction — two defaults would make "what does the room revert to?"
  // ambiguous, and table numbering hangs off the answer.
  if (body.isDefault === true && !setup.isDefault) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.floorPlanSetup.updateMany({
        where: { floorPlanId: setup.floorPlanId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      })
      return tx.floorPlanSetup.update({
        where: { id: params.setupId },
        data: { ...data, isDefault: true },
      })
    })
    return NextResponse.json(updated)
  }

  const updated = await prisma.floorPlanSetup.update({
    where: { id: params.setupId },
    data,
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.floorPlanSetup.findFirst({
    where: { id: params.setupId, deletedAt: null },
    include: { floorPlan: { select: { venueId: true } } },
  })
  if (!setup) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && setup.floorPlan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // The default layout is the arrangement the venue reverts to between events,
  // and it owns the real table numbers. It can be edited, never removed.
  if (setup.isDefault) {
    return NextResponse.json(
      { error: 'THE DEFAULT LAYOUT CANNOT BE DELETED — EDIT IT INSTEAD' },
      { status: 409 },
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.setupItem.updateMany({
      where: { setupId: params.setupId, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    })
    await tx.floorPlanSetup.update({
      where: { id: params.setupId },
      data: { deletedAt: new Date(), isActive: false },
    })
  })

  return NextResponse.json({ success: true })
}
