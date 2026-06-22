import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string; elementId: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.elementInventoryItem.findMany({
    where: { elementId: params.elementId, item: { deletedAt: null } },
    include: { item: { include: { category: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(items)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignments } = await req.json()
  if (!Array.isArray(assignments)) {
    return NextResponse.json({ error: 'assignments array is required' }, { status: 400 })
  }

  const existing = await prisma.elementInventoryItem.findMany({
    where: { elementId: params.elementId },
    select: { id: true, itemId: true },
  })
  const existingMap = new Map(existing.map((e) => [e.itemId, e.id]))
  const incomingIds = new Set(assignments.filter((a: any) => a.itemId).map((a: any) => a.itemId))

  const toDelete = existing.filter((e) => !incomingIds.has(e.itemId)).map((e) => e.id)
  if (toDelete.length > 0) {
    await prisma.elementInventoryItem.deleteMany({ where: { id: { in: toDelete } } })
  }

  for (const a of assignments) {
    const qty = a.quantity ?? 0
    if (existingMap.has(a.itemId)) {
      await prisma.elementInventoryItem.update({
        where: { id: existingMap.get(a.itemId)! },
        data: { quantity: qty },
      })
    } else {
      await prisma.elementInventoryItem.create({
        data: { elementId: params.elementId, itemId: a.itemId, quantity: qty },
      })
    }
  }

  return NextResponse.json({ saved: assignments.length })
}
