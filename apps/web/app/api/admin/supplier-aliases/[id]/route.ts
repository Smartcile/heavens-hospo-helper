import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.delete')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const alias = await prisma.supplierItemAlias.findFirst({
    where: { id: params.id, deletedAt: null, supplier: { venueId, deletedAt: null } },
    select: { id: true },
  })
  if (!alias) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.supplierItemAlias.update({ where: { id: alias.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
