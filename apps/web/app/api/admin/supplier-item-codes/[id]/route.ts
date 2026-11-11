import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolvePurchasingVenue, toFiniteNumber } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

async function loadCode(id: string, venueId: string) {
  return prisma.supplierItemCode.findFirst({
    where: { id, deletedAt: null, supplier: { venueId, deletedAt: null } },
    include: { supplier: { select: { id: true, venueId: true } } },
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    supplierSku?: unknown
    purchasePrice?: unknown
    orderingUnitId?: string | null
    isPreferred?: boolean
    notes?: string | null
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const code = await loadCode(params.id, venueId)
  if (!code) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body?.supplierSku !== undefined) {
    const sku = String(body.supplierSku).trim()
    if (!sku) return NextResponse.json({ error: 'supplierSku cannot be blank' }, { status: 400 })
    data.supplierSku = sku
  }
  if (body?.purchasePrice !== undefined) data.purchasePrice = toFiniteNumber(body.purchasePrice)
  if (body?.orderingUnitId !== undefined) data.orderingUnitId = body.orderingUnitId || null
  if (body?.isPreferred !== undefined) data.isPreferred = body.isPreferred === true
  if (body?.notes !== undefined) data.notes = body.notes

  const updated = await prisma.supplierItemCode.update({ where: { id: code.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.delete')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const code = await loadCode(params.id, venueId)
  if (!code) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.supplierItemCode.update({ where: { id: code.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
