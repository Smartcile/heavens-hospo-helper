import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { ensureDefaultSetup } from '@/lib/furniture-server'
import { guardAccess } from '@/lib/permissions'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'floorplans.plans.view')
  if (denied) return denied

  const plan = await prisma.floorPlan.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!plan) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })

  // Every plan always has a default layout to fall back to, so create it on
  // first read rather than making the editor cope with "no layouts at all".
  await ensureDefaultSetup(params.id)

  const setups = await prisma.floorPlanSetup.findMany({
    where: { floorPlanId: params.id, deletedAt: null },
    include: {
      _count: { select: { items: true } },
    },
    // Default first, then event layouts newest-first.
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(setups)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'floorplans.plans.edit')
  if (denied) return denied

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
