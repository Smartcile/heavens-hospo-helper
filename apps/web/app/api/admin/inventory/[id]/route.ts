import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.id, deletedAt: null },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, categoryId, unit, defaultParLevel, furnitureType, elementWidth, elementDepth, elementShape, defaultColour, defaultChairCount } = await req.json()
  const updated = await prisma.inventoryItem.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.toUpperCase().trim() }),
      ...(categoryId !== undefined && { categoryId }),
      ...(unit !== undefined && { unit }),
      ...(defaultParLevel !== undefined && { defaultParLevel }),
      ...(furnitureType !== undefined && { furnitureType }),
      ...(elementWidth !== undefined && { elementWidth }),
      ...(elementDepth !== undefined && { elementDepth }),
      ...(elementShape !== undefined && { elementShape }),
      ...(defaultColour !== undefined && { defaultColour }),
      ...(defaultChairCount !== undefined && { defaultChairCount }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.id, deletedAt: null },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.inventoryItem.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })
  return NextResponse.json({ success: true })
}
