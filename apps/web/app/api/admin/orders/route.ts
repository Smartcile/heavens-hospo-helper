import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orders = await prisma.wooOrder.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, price: true } },
        },
      },
    },
    orderBy: [{ fulfillmentDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
  })
  return NextResponse.json(orders)
}
