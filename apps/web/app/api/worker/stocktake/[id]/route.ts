import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

interface Params { params: { id: string } }

export async function GET(req: NextRequest, { params }: Params) {
  const payload = await getWorkerSession()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const record = await prisma.stocktakeRecord.findFirst({
    where: { id: params.id, venueId: payload.venueId, deletedAt: null },
    include: {
      lineItems: {
        include: { item: { include: { category: true } } },
        orderBy: { item: { name: 'asc' } },
      },
    },
  })
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(record)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const payload = await getWorkerSession()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lineItems, status } = await req.json()

  if (Array.isArray(lineItems)) {
    for (const li of lineItems) {
      const counted = li.countedQuantity ?? 0
      const expected = li.expectedQuantity ?? 0
      await prisma.stocktakeLineItem.updateMany({
        where: { recordId: params.id, itemId: li.itemId },
        data: { countedQuantity: counted, variance: counted - expected },
      })
    }
  }

  if (status) {
    const data: any = { status }
    if (status === 'COMPLETED') {
      data.completedById = payload.staffId
      data.completedAt = new Date()
    }
    await prisma.stocktakeRecord.update({ where: { id: params.id }, data })
  }

  return NextResponse.json({ success: true })
}
