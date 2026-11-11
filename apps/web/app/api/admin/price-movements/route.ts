import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const acknowledged = req.nextUrl.searchParams.get('acknowledged') ?? 'false'
  const where: Record<string, unknown> = { venueId, deletedAt: null }
  if (acknowledged === 'false') where.acknowledgedAt = null
  else if (acknowledged === 'true') where.acknowledgedAt = { not: null }

  const movements = await prisma.supplierPriceMovement.findMany({
    where,
    include: {
      inventoryItem: { select: { id: true, name: true, unit: true } },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ movements, count: movements.length })
}
