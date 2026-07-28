import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { pushOrderStatus } from '@/lib/woo-push'
import type { OrderStatus } from '@prisma/client'

const VALID_STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await prisma.wooOrder.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && order.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await req.json()
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const updated = await prisma.wooOrder.update({
    where: { id: params.id },
    data: { status },
  })

  // Push the status change to WooCommerce (best-effort — logs to SyncLog, never throws)
  await pushOrderStatus(updated.id)

  return NextResponse.json(updated)
}
