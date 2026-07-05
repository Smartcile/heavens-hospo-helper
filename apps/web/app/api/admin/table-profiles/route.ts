import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!venueScope) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const profiles = await prisma.tableProfile.findMany({
    where: { venueId: venueScope, deletedAt: null },
    include: { bomItems: { include: { item: { select: { id: true, name: true, unit: true } } } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(profiles)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, type, capacity, width, depth, shape, colour, chairCount, seatingDensity, maxHeadChairs, bomItems } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const profile = await prisma.tableProfile.create({
    data: {
      venueId: session.user.venueId,
      name: name.toUpperCase().trim(),
      type: type ?? 'TABLE',
      capacity: capacity ?? 0,
      width: width ?? 80,
      depth: depth ?? 80,
      shape: shape ?? 'RECTANGLE',
      colour: colour ?? '#555',
      chairCount: chairCount ?? 0,
      seatingDensity: seatingDensity ?? null,
      maxHeadChairs: maxHeadChairs ?? 1,
      ...(bomItems?.length
        ? { bomItems: { create: bomItems.map((b: { inventoryItemId: string; quantity: number; perChair: boolean }) => ({ inventoryItemId: b.inventoryItemId, quantity: b.quantity, perChair: b.perChair ?? false })) } }
        : {}),
    },
    include: { bomItems: true },
  })

  return NextResponse.json(profile, { status: 201 })
}
