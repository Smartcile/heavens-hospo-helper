import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { invoiceTotals, lineTotals, resolvePurchasingVenue, round2, toFiniteNumber } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

interface RawLine {
  id?: string
  inventoryItemId?: string | null
  supplierSku?: string | null
  description?: unknown
  qty?: unknown
  uomId?: string | null
  unitPrice?: unknown
  matchStatus?: string
  purchaseOrderLineId?: string | null
  deliveryItemId?: string | null
}

const MATCH_STATUSES = ['UNMATCHED', 'MATCHED', 'VARIANCE']
const INVOICE_STATUSES = ['DRAFT', 'PENDING_MATCH', 'MATCHED', 'VARIANCE', 'APPROVED', 'PAID', 'CANCELLED']

async function loadInvoice(id: string, venueId: string) {
  return prisma.supplierInvoice.findFirst({
    where: { id, venueId, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      purchaseOrder: { select: { id: true, number: true, status: true } },
      deliveries: { where: { deletedAt: null }, select: { id: true, deliveredAt: true } },
    },
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const invoice = await loadInvoice(params.id, venueId)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(invoice)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    number?: unknown
    invoiceDate?: string | null
    dueDate?: string | null
    status?: string
    currency?: string | null
    purchaseOrderId?: string | null
    notes?: string | null
    lines?: RawLine[]
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: params.id, venueId, deletedAt: null },
    include: { lines: { where: { deletedAt: null }, select: { id: true } } },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const header: Record<string, unknown> = {}
  if (body?.number !== undefined) {
    const number = String(body.number).trim()
    if (!number) return NextResponse.json({ error: 'number cannot be blank' }, { status: 400 })
    header.number = number
  }
  if (body?.invoiceDate !== undefined) header.invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : null
  if (body?.dueDate !== undefined) header.dueDate = body.dueDate ? new Date(body.dueDate) : null
  if (body?.currency !== undefined) header.currency = body.currency || 'NZD'
  if (body?.notes !== undefined) header.notes = body.notes
  if (body?.purchaseOrderId !== undefined) {
    if (body.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: body.purchaseOrderId, venueId, deletedAt: null },
        select: { id: true },
      })
      if (!po) return NextResponse.json({ error: 'Purchase order not found for this venue' }, { status: 400 })
      header.purchaseOrderId = po.id
    } else {
      header.purchaseOrderId = null
    }
  }
  if (body?.status !== undefined && INVOICE_STATUSES.includes(body.status)) header.status = body.status

  const rawLines = body?.lines
  if (Array.isArray(rawLines)) {
    const existingIds = new Set(invoice.lines.map((line) => line.id))
    const incomingIds = new Set(rawLines.map((line) => line.id).filter(Boolean) as string[])
    if ([...incomingIds].some((id) => !existingIds.has(id))) {
      return NextResponse.json({ error: 'A line does not belong to this invoice' }, { status: 400 })
    }

    const lines = rawLines.map((line) => {
      const qty = toFiniteNumber(line.qty) ?? 0
      const unitPrice = toFiniteNumber(line.unitPrice) ?? 0
      const inventoryItemId = line.inventoryItemId || null
      const matchStatus: 'UNMATCHED' | 'MATCHED' | 'VARIANCE' = MATCH_STATUSES.includes(
        String(line.matchStatus ?? ''),
      )
        ? (String(line.matchStatus) as 'UNMATCHED' | 'MATCHED' | 'VARIANCE')
        : inventoryItemId
          ? 'MATCHED'
          : 'UNMATCHED'
      return {
        id: line.id,
        inventoryItemId,
        supplierSku: line.supplierSku || null,
        description: String(line.description ?? '').trim(),
        qty,
        uomId: line.uomId || null,
        unitPrice,
        lineTotal: lineTotals({ qty, unitPrice }),
        matchStatus,
        purchaseOrderLineId: line.purchaseOrderLineId || null,
        deliveryItemId: line.deliveryItemId || null,
      }
    })
    if (lines.some((line) => !line.description)) {
      return NextResponse.json({ error: 'Every line needs a description' }, { status: 400 })
    }

    const totals = invoiceTotals(lines)
    header.subtotal = round2(totals.subtotal)
    header.gst = round2(totals.gst)
    header.total = round2(totals.total)

    const removed = invoice.lines.filter((line) => !incomingIds.has(line.id))

    await prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.supplierInvoiceLine.updateMany({
          where: { id: { in: removed.map((line) => line.id) } },
          data: { deletedAt: new Date() },
        })
      }
      for (const line of lines) {
        const data = {
          inventoryItemId: line.inventoryItemId,
          supplierSku: line.supplierSku,
          description: line.description,
          qty: line.qty,
          uomId: line.uomId,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          matchStatus: line.matchStatus,
          purchaseOrderLineId: line.purchaseOrderLineId,
          deliveryItemId: line.deliveryItemId,
        }
        if (line.id) {
          await tx.supplierInvoiceLine.update({ where: { id: line.id }, data })
        } else {
          await tx.supplierInvoiceLine.create({ data: { ...data, invoiceId: invoice.id } })
        }
      }
      if (Object.keys(header).length > 0) {
        await tx.supplierInvoice.update({ where: { id: invoice.id }, data: header })
      }
    })
  } else if (Object.keys(header).length > 0) {
    await prisma.supplierInvoice.update({ where: { id: invoice.id }, data: header })
  }

  const updated = await loadInvoice(invoice.id, venueId)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.delete')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const invoice = await prisma.supplierInvoice.findFirst({
    where: { id: params.id, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date()
  await prisma.$transaction([
    prisma.supplierInvoiceLine.updateMany({ where: { invoiceId: invoice.id }, data: { deletedAt: now } }),
    prisma.supplierInvoice.update({ where: { id: invoice.id }, data: { deletedAt: now } }),
  ])

  return NextResponse.json({ success: true })
}
