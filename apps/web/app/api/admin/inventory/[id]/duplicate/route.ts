import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const original = await prisma.inventoryItem.findFirst({
    where: { id: params.id, deletedAt: null },
  })
  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'MANAGER' && original.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const copy = await prisma.inventoryItem.create({
    data: {
      venueId: original.venueId,
      categoryId: original.categoryId,
      name: `${original.name} (COPY)`,
      unit: original.unit,
      defaultParLevel: original.defaultParLevel,
      furnitureType: original.furnitureType,
      elementWidth: original.elementWidth,
      elementDepth: original.elementDepth,
      elementShape: original.elementShape,
      defaultColour: original.defaultColour,
      defaultChairCount: original.defaultChairCount,
    },
  })
  return NextResponse.json(copy, { status: 201 })
}
