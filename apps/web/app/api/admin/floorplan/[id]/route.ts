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
    include: {
      elements: {
        where: { deletedAt: null, isActive: true },
        orderBy: [{ zIndex: 'asc' }, { sortOrder: 'asc' }],
        include: { inventoryItems: { select: { itemId: true } } },
      },
    },
  })

  if (!plan) return NextResponse.json({ error: 'Floor plan not found' }, { status: 404 })

  return NextResponse.json(plan)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, slug, isDefault, roomWidth, roomDepth, gridUnit, isActive } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = String(name).toUpperCase().trim()
  if (slug !== undefined) updates.slug = slug.trim().toLowerCase()
  if (isDefault !== undefined) updates.isDefault = isDefault
  if (roomWidth !== undefined) updates.roomWidth = roomWidth
  if (roomDepth !== undefined) updates.roomDepth = roomDepth
  if (gridUnit !== undefined) updates.gridUnit = gridUnit
  if (isActive !== undefined) updates.isActive = isActive

  const plan = await prisma.floorPlan.update({
    where: { id: params.id },
    data: updates,
  })

  return NextResponse.json(plan)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.floorPlan.update({
    where: { id: params.id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  })

  // Soft-delete all elements
  await prisma.floorPlanElement.updateMany({
    where: { floorPlanId: params.id, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
