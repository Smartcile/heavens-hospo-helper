import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.approve')
  if (denied) return denied

  const body = await req.json().catch(() => null) as { venueId?: string; acknowledged?: boolean } | null
  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const movement = await prisma.supplierPriceMovement.findFirst({
    where: { id: params.id, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!movement) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.supplierPriceMovement.update({
    where: { id: movement.id },
    data: { acknowledgedAt: body?.acknowledged === false ? null : new Date() },
  })
  return NextResponse.json(updated)
}
