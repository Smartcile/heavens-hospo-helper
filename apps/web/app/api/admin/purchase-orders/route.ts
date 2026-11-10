import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { computePurchaseOrderTotals, type PurchaseOrderStatus } from '@/lib/purchasing'
import { lineTotals, resolvePurchasingVenue, round2, toFiniteNumber } from '@/lib/purchasing-api'

const STATUSES: PurchaseOrderStatus[] = ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']

interface RawLine {
  inventoryItemId?: string | null
  description?: unknown
  qty?: unknown
  uomId?: string | null
  unitPrice?: unknown
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const statusParam = req.nextUrl.searchParams.get('status')
  const search = (req.nextUrl.searchParams.get('search') ?? '').trim()

  const where: Record<string, unknown> = { venueId, deletedAt: null }
  if (statusParam && STATUSES.includes(statusParam as PurchaseOrderStatus)) where.status = statusParam
  if (search) {
    where.OR = [
      { number: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  const orders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { where: { deletedAt: null }, select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    orders.map(({ lines, ...order }) => ({ ...order, lineCount: lines.length })),
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.create')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    supplierId?: string
    number?: unknown
    expectedAt?: string | null
    notes?: string | null
    lines?: RawLine[]
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const number = String(body?.number ?? '').trim()
  if (!number) return NextResponse.json({ error: 'number is required' }, { status: 400 })
  if (!body?.supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: body.supplierId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 400 })

  const rawLines = Array.isArray(body?.lines) ? body.lines : []
  if (rawLines.length === 0) return NextResponse.json({ error: 'At least one line is required' }, { status: 400 })

  const lines = rawLines.map((line) => {
    const qty = toFiniteNumber(line.qty) ?? 0
    const unitPrice = toFiniteNumber(line.unitPrice) ?? 0
    return {
      inventoryItemId: line.inventoryItemId || null,
      description: String(line.description ?? '').trim(),
      qty,
      uomId: line.uomId || null,
      unitPrice,
      lineTotal: lineTotals({ qty, unitPrice }),
    }
  })
  if (lines.some((line) => line.qty <= 0)) {
    return NextResponse.json({ error: 'Every line must have qty > 0' }, { status: 400 })
  }
  if (lines.some((line) => !line.description)) {
    return NextResponse.json({ error: 'Every line needs a description' }, { status: 400 })
  }

  const totals = computePurchaseOrderTotals(lines)

  const order = await prisma.purchaseOrder.create({
    data: {
      venueId,
      supplierId: supplier.id,
      number,
      status: 'DRAFT',
      expectedAt: body?.expectedAt ? new Date(body.expectedAt) : null,
      notes: body?.notes ?? null,
      subtotal: round2(totals.subtotal),
      gst: round2(totals.gst),
      total: round2(totals.total),
      lines: { create: lines },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { where: { deletedAt: null } },
    },
  })

  return NextResponse.json(order, { status: 201 })
}
