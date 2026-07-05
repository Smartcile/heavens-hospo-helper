import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await prisma.floorPlan.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!plan) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })

  const setups = await prisma.floorPlanSetup.findMany({
    where: { floorPlanId: params.id, deletedAt: null },
    include: {
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(setups)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const plan = await prisma.floorPlan.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!plan) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && plan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const setup = await prisma.floorPlanSetup.create({
    data: {
      floorPlanId: params.id,
      name: body.name.toUpperCase().trim(),
      eventDate: body.eventDate ? new Date(body.eventDate) : null,
      calendarEventId: body.calendarEventId ?? null,
      notes: body.notes ?? null,
    },
  })

  return NextResponse.json(setup, { status: 201 })
}
