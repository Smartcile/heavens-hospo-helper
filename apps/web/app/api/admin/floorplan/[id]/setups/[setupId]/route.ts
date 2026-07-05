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
        include: { tableProfile: { select: { id: true, name: true, width: true, depth: true, colour: true, chairCount: true } } },
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
