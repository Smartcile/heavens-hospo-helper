import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const items = await prisma.tableProfileItem.findMany({
    where: { tableProfileId: params.id },
    include: { item: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(items)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.tableProfile.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && profile.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { items } = await req.json()
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.tableProfileItem.findMany({
      where: { tableProfileId: params.id },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((e) => e.id))
    const incomingIds = new Set(items.filter((i: { id?: string }) => i.id).map((i: { id: string }) => i.id))
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))
    if (toDelete.length > 0) {
      await tx.tableProfileItem.deleteMany({ where: { id: { in: toDelete } } })
    }

    for (const item of items) {
      const data = {
        tableProfileId: params.id,
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity ?? 1,
        perChair: item.perChair ?? false,
      }
      if (item.id && existingIds.has(item.id)) {
        await tx.tableProfileItem.update({ where: { id: item.id }, data })
      } else {
        await tx.tableProfileItem.create({ data })
      }
    }
  })

  const updated = await prisma.tableProfileItem.findMany({
    where: { tableProfileId: params.id },
    include: { item: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(updated)
}
