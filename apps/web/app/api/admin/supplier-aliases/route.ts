import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { normaliseInvoiceText } from '@/lib/invoice-match'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const supplierId = req.nextUrl.searchParams.get('supplierId')
  if (!supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 404 })

  const aliases = await prisma.supplierItemAlias.findMany({
    where: { supplierId, deletedAt: null },
    include: { inventoryItem: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(aliases)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    supplierId?: string
    text?: unknown
    inventoryItemId?: string
    source?: string
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })
  if (!body?.inventoryItemId) return NextResponse.json({ error: 'inventoryItemId is required' }, { status: 400 })

  const key = normaliseInvoiceText(body?.text)
  if (!key) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  const [supplier, item] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: body.supplierId, venueId, deletedAt: null }, select: { id: true } }),
    prisma.inventoryItem.findFirst({ where: { id: body.inventoryItemId, venueId, deletedAt: null }, select: { id: true } }),
  ])
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 404 })
  if (!item) return NextResponse.json({ error: 'Inventory item not found for this venue' }, { status: 404 })

  const source = body?.source === 'IMPORT' ? 'IMPORT' : 'MANUAL'
  const alias = await prisma.supplierItemAlias.upsert({
    where: { supplierId_normalisedTextKey: { supplierId: supplier.id, normalisedTextKey: key } },
    update: { inventoryItemId: item.id, source, deletedAt: null },
    create: {
      supplierId: supplier.id,
      normalisedTextKey: key,
      inventoryItemId: item.id,
      source,
    },
  })

  return NextResponse.json(alias, { status: 201 })
}
