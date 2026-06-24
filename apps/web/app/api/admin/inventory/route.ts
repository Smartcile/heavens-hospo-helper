import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const categoryId = url.searchParams.get('categoryId')
  const furnitureOnly = url.searchParams.get('furniture') === 'true'

  const where: any = { deletedAt: null, venueId: session.user.venueId }
  if (categoryId) where.categoryId = categoryId
  if (furnitureOnly) where.furnitureType = { not: null }
  if (session.user.role === 'ADMIN') delete where.venueId

  const items = await prisma.inventoryItem.findMany({
    where,
    include: { category: true, _count: { select: { elements: true } } },
    orderBy: { name: 'asc' },
  })
  const result = items.map(({ _count, ...item }) => ({ ...item, placedCount: _count.elements }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, categoryId, unit, defaultParLevel, totalQty, furnitureType, elementWidth, elementDepth, elementShape, defaultColour, defaultChairCount } = await req.json()
  if (!name || !categoryId) {
    return NextResponse.json({ error: 'name and categoryId are required' }, { status: 400 })
  }

  const item = await prisma.inventoryItem.create({
    data: {
      venueId: session.user.venueId,
      name: name.toUpperCase().trim(),
      categoryId,
      unit: unit ?? 'EA',
      defaultParLevel: defaultParLevel ?? 0,
      totalQty: totalQty ?? 0,
      furnitureType: furnitureType ?? null,
      elementWidth: elementWidth ?? null,
      elementDepth: elementDepth ?? null,
      elementShape: elementShape ?? null,
      defaultColour: defaultColour ?? null,
      defaultChairCount: defaultChairCount ?? 0,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
