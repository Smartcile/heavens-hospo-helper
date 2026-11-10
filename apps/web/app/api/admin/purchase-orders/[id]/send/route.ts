import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({})) as { venueId?: string }
  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, venueId, deletedAt: null },
    select: { id: true, status: true, orderedAt: true },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (order.status !== 'DRAFT') {
    return NextResponse.json({ error: 'Only a DRAFT purchase order can be sent' }, { status: 409 })
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: { status: 'SENT', orderedAt: order.orderedAt ?? new Date() },
  })
  return NextResponse.json(updated)
}
