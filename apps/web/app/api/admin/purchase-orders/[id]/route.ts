import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { computePurchaseOrderTotals } from '@/lib/purchasing'
import { lineTotals, resolvePurchasingVenue, round2, toFiniteNumber } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

interface RawLine {
  id?: string
  inventoryItemId?: string | null
  description?: unknown
  qty?: unknown
  uomId?: string | null
  unitPrice?: unknown
}

async function loadOrder(id: string, venueId: string) {
  return prisma.purchaseOrder.findFirst({
    where: { id, venueId, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: {
        where: { deletedAt: null },
        include: { _count: { select: { invoiceLines: true } } },
        orderBy: { createdAt: 'asc' },
      },
      deliveries: { where: { deletedAt: null }, select: { id: true, deliveredAt: true } },
      invoices: { where: { deletedAt: null }, select: { id: true, number: true, status: true } },
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

  const order = await loadOrder(params.id, venueId)
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(order)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
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

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, venueId, deletedAt: null },
    include: {
      lines: {
        where: { deletedAt: null },
        include: { _count: { select: { invoiceLines: true } } },
      },
    },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body?.supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: body.supplierId, venueId, deletedAt: null },
      select: { id: true },
    })
    if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 400 })
  }

  const header: Record<string, unknown> = {}
  if (body?.number !== undefined) {
    const number = String(body.number).trim()
    if (!number) return NextResponse.json({ error: 'number cannot be blank' }, { status: 400 })
    header.number = number
  }
  if (body?.supplierId !== undefined) header.supplierId = body.supplierId
  if (body?.expectedAt !== undefined) header.expectedAt = body.expectedAt ? new Date(body.expectedAt) : null
  if (body?.notes !== undefined) header.notes = body.notes

  const rawLines = body?.lines
  if (Array.isArray(rawLines)) {
    const existingById = new Map(order.lines.map((line) => [line.id, line]))
    const incomingIds = new Set(rawLines.map((line) => line.id).filter(Boolean) as string[])
    const removed = order.lines.filter((line) => !incomingIds.has(line.id))
    const blocked = removed.find((line) => line.receivedQty > 0 || line._count.invoiceLines > 0)
    if (blocked) {
      return NextResponse.json(
        { error: 'Cannot remove a line that has been received or invoiced' },
        { status: 400 },
      )
    }

    const lines = rawLines.map((line) => {
      if (line.id && !existingById.has(line.id)) {
        return null
      }
      const qty = toFiniteNumber(line.qty) ?? 0
      const unitPrice = toFiniteNumber(line.unitPrice) ?? 0
      return {
        id: line.id,
        inventoryItemId: line.inventoryItemId || null,
        description: String(line.description ?? '').trim(),
        qty,
        uomId: line.uomId || null,
        unitPrice,
        lineTotal: lineTotals({ qty, unitPrice }),
      }
    })
    if (lines.some((line) => line === null)) {
      return NextResponse.json({ error: 'A line does not belong to this purchase order' }, { status: 400 })
    }
    const clean = lines.filter((line): line is NonNullable<typeof line> => line !== null)
    if (clean.some((line) => line.qty <= 0)) {
      return NextResponse.json({ error: 'Every line must have qty > 0' }, { status: 400 })
    }
    if (clean.some((line) => !line.description)) {
      return NextResponse.json({ error: 'Every line needs a description' }, { status: 400 })
    }

    const totals = computePurchaseOrderTotals(clean)
    header.subtotal = round2(totals.subtotal)
    header.gst = round2(totals.gst)
    header.total = round2(totals.total)

    await prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.purchaseOrderLine.updateMany({
          where: { id: { in: removed.map((line) => line.id) } },
          data: { deletedAt: new Date() },
        })
      }
      for (const line of clean) {
        const data = {
          inventoryItemId: line.inventoryItemId,
          description: line.description,
          qty: line.qty,
          uomId: line.uomId,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
        }
        if (line.id) {
          await tx.purchaseOrderLine.update({ where: { id: line.id }, data })
        } else {
          await tx.purchaseOrderLine.create({ data: { ...data, purchaseOrderId: order.id } })
        }
      }
      if (Object.keys(header).length > 0) {
        await tx.purchaseOrder.update({ where: { id: order.id }, data: header })
      }
    })
  } else if (Object.keys(header).length > 0) {
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: header })
  }

  const updated = await loadOrder(order.id, venueId)
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.delete')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(
    session.user,
    req.nextUrl.searchParams.get('venueId'),
  )
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, venueId, deletedAt: null },
    include: { lines: { where: { deletedAt: null }, select: { id: true, receivedQty: true } } },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (order.lines.some((line) => line.receivedQty > 0)) {
    return NextResponse.json({ error: 'Cannot delete a purchase order that has received stock' }, { status: 400 })
  }

  const now = new Date()
  await prisma.$transaction([
    prisma.purchaseOrderLine.updateMany({ where: { purchaseOrderId: order.id }, data: { deletedAt: now } }),
    prisma.purchaseOrder.update({ where: { id: order.id }, data: { deletedAt: now } }),
  ])

  return NextResponse.json({ success: true })
}
