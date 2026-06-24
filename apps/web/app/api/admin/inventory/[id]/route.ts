import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, categoryId, unit, defaultParLevel, totalQty, furnitureType, elementWidth, elementDepth, elementShape, defaultColour, defaultChairCount } = await req.json()

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name.toUpperCase().trim()
  if (categoryId !== undefined) data.categoryId = categoryId
  if (unit !== undefined) data.unit = unit
  if (defaultParLevel !== undefined) data.defaultParLevel = parseInt(String(defaultParLevel)) || 0
  if (totalQty !== undefined) data.totalQty = parseInt(String(totalQty)) || 0
  if (furnitureType !== undefined) data.furnitureType = furnitureType || null
  if (elementWidth !== undefined) data.elementWidth = parseFloat(String(elementWidth)) || null
  if (elementDepth !== undefined) data.elementDepth = parseFloat(String(elementDepth)) || null
  if (elementShape !== undefined) data.elementShape = elementShape || null
  if (defaultColour !== undefined) data.defaultColour = defaultColour || null
  if (defaultChairCount !== undefined) data.defaultChairCount = parseInt(String(defaultChairCount)) || 0

  const updated = await prisma.inventoryItem.update({
    where: { id: params.id },
    data,
    include: { category: true },
  })
  return NextResponse.json(updated)
}
