import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string; setupId: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const groups = await prisma.tableGroup.findMany({
    where: { setupId: params.setupId, deletedAt: null },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(groups)
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.floorPlanSetup.findFirst({
    where: { id: params.setupId, deletedAt: null },
    include: { floorPlan: { select: { venueId: true } } },
  })
  if (!setup) return NextResponse.json({ error: 'Setup not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && setup.floorPlan.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, itemIds } = body

  if (!Array.isArray(itemIds) || itemIds.length < 2) {
    return NextResponse.json({ error: 'At least 2 itemIds are required to form a group' }, { status: 400 })
  }

  // Validate all items are same profile
  const items = await prisma.setupItem.findMany({
    where: { id: { in: itemIds }, setupId: params.setupId, deletedAt: null },
    select: { id: true, tableProfileId: true },
  })
  if (items.length !== itemIds.length) {
    return NextResponse.json({ error: 'One or more itemIds are invalid' }, { status: 400 })
  }
  const profileIds = new Set(items.map((i) => i.tableProfileId))
  if (profileIds.size > 1) {
    return NextResponse.json({ error: 'All items in a group must have the same table profile' }, { status: 400 })
  }

  const group = await prisma.$transaction(async (tx) => {
    const g = await tx.tableGroup.create({
      data: { setupId: params.setupId, name: name?.trim() || null },
    })
    await tx.setupItem.updateMany({
      where: { id: { in: itemIds } },
      data: { tableGroupId: g.id },
    })
    return g
  })

  return NextResponse.json(group, { status: 201 })
}
