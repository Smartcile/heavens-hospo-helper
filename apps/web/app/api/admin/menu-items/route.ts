import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.menuItem.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    include: { recipe: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, recipeId, price, wooProductId, wooCategoryId, description } = await req.json()
  if (!name?.trim() || !recipeId) {
    return NextResponse.json({ error: 'name and recipeId are required' }, { status: 400 })
  }

  const item = await prisma.menuItem.create({
    data: {
      venueId: session.user.venueId,
      name: name.toUpperCase().trim(),
      recipeId,
      price: parseFloat(String(price)) || 0,
      wooProductId: wooProductId || null,
      wooCategoryId: wooCategoryId || null,
      description: description || null,
    },
    include: { recipe: { select: { id: true, name: true } } },
  })
  return NextResponse.json(item, { status: 201 })
}
