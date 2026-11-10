import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { invoiceTotals, lineTotals, resolvePurchasingVenue, round2, toFiniteNumber } from '@/lib/purchasing-api'

interface RawLine {
  inventoryItemId?: string | null
  supplierSku?: string | null
  description?: unknown
  qty?: unknown
  uomId?: string | null
  unitPrice?: unknown
}

const STATUSES = ['DRAFT', 'PENDING_MATCH', 'MATCHED', 'VARIANCE', 'APPROVED', 'PAID', 'CANCELLED']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const status = req.nextUrl.searchParams.get('status')
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')

  const where: Record<string, unknown> = { venueId, deletedAt: null }
  if (status && STATUSES.includes(status)) where.status = status
  if (from || to) {
    const range: Record<string, Date> = {}
    if (from) range.gte = new Date(from)
    if (to) range.lte = new Date(to)
    where.invoiceDate = range
  }

  const invoices = await prisma.supplierInvoice.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { where: { deletedAt: null }, select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    invoices.map(({ lines, ...invoice }) => ({ ...invoice, lineCount: lines.length })),
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
    invoiceDate?: string | null
    dueDate?: string | null
    currency?: string | null
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

  const existing = await prisma.supplierInvoice.findFirst({
    where: { venueId, supplierId: supplier.id, number },
    select: { id: true },
  })
  if (existing) {
    return NextResponse.json({ error: 'INVOICE NUMBER ALREADY EXISTS', invoiceId: existing.id }, { status: 409 })
  }

  const rawLines = Array.isArray(body?.lines) ? body.lines : []
  const lines = rawLines.map((line) => {
    const qty = toFiniteNumber(line.qty) ?? 0
    const unitPrice = toFiniteNumber(line.unitPrice) ?? 0
    const inventoryItemId = line.inventoryItemId || null
    return {
      inventoryItemId,
      supplierSku: line.supplierSku || null,
      description: String(line.description ?? '').trim(),
      qty,
      uomId: line.uomId || null,
      unitPrice,
      lineTotal: lineTotals({ qty, unitPrice }),
      matchStatus: inventoryItemId ? ('MATCHED' as const) : ('UNMATCHED' as const),
    }
  })
  if (lines.some((line) => !line.description)) {
    return NextResponse.json({ error: 'Every line needs a description' }, { status: 400 })
  }

  const totals = invoiceTotals(lines)

  const invoice = await prisma.supplierInvoice.create({
    data: {
      venueId,
      supplierId: supplier.id,
      number,
      invoiceDate: body?.invoiceDate ? new Date(body.invoiceDate) : null,
      dueDate: body?.dueDate ? new Date(body.dueDate) : null,
      status: 'DRAFT',
      currency: body?.currency || 'NZD',
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

  return NextResponse.json(invoice, { status: 201 })
}
