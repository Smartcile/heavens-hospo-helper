import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where: any = { deletedAt: null, venueId: session.user.venueId }
  if (session.user.role === 'ADMIN') delete where.venueId

  const records = await prisma.stocktakeRecord.findMany({
    where,
    include: {
      completedBy: { select: { id: true, firstName: true, lastName: true } },
      assignedStaff: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { lineItems: true } },
    },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(records)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date, assignedRoleId, assignedStaffId, notes } = await req.json()
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const record = await prisma.stocktakeRecord.create({
    data: {
      venueId: session.user.venueId,
      date: new Date(date),
      assignedRoleId: assignedRoleId ?? null,
      assignedStaffId: assignedStaffId ?? null,
      notes: notes ?? null,
      status: 'PENDING',
    },
  })

  const items = await prisma.inventoryItem.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    include: {
      elements: { where: { element: { deletedAt: null } }, select: { quantity: true } },
    },
  })

  const lineItems = items.map((item) => {
    const expected = item.elements.reduce((sum, e) => sum + e.quantity, 0)
    return {
      recordId: record.id,
      itemId: item.id,
      expectedQuantity: expected,
      countedQuantity: 0,
      variance: -expected,
    }
  })

  if (lineItems.length > 0) {
    await prisma.stocktakeLineItem.createMany({ data: lineItems })
  }

  const created = await prisma.stocktakeRecord.findUnique({
    where: { id: record.id },
    include: {
      lineItems: { include: { item: { include: { category: true } } } },
      _count: { select: { lineItems: true } },
    },
  })
  return NextResponse.json(created, { status: 201 })
}
