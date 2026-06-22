import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lineItems } = await req.json()
  if (!Array.isArray(lineItems)) {
    return NextResponse.json({ error: 'lineItems array required' }, { status: 400 })
  }

  for (const li of lineItems) {
    const counted = li.countedQuantity ?? 0
    const expected = li.expectedQuantity ?? 0
    await prisma.stocktakeLineItem.updateMany({
      where: { recordId: params.id, itemId: li.itemId },
      data: {
        countedQuantity: counted,
        expectedQuantity: expected,
        variance: counted - expected,
      },
    })
  }

  return NextResponse.json({ saved: lineItems.length })
}
