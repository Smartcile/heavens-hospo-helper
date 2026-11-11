import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { compareLineToPurchaseOrder, normaliseInvoiceText } from '@/lib/invoice-match'
import { invoiceTotals, lineTotals, resolvePurchasingVenue, round2, toFiniteNumber } from '@/lib/purchasing-api'

interface RawLine {
  inventoryItemId?: string | null
  supplierSku?: string | null
  description?: unknown
  qty?: unknown
  uomId?: string | null
  unitPrice?: unknown
  purchaseOrderLineId?: string | null
  match?: { inventoryItemId?: string | null }
  poLine?: { id?: string | null } | null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.create')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    supplierId?: string
    purchaseOrderId?: string | null
    fileUrl?: string | null
    header?: {
      invoiceNumber?: string
      number?: string
      invoiceDate?: string | null
      dueDate?: string | null
      currency?: string | null
      notes?: string | null
    }
    lines?: RawLine[]
    confirmAliases?: boolean
    confirmItemCodes?: boolean
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: body.supplierId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 404 })

  const number = String(body?.header?.invoiceNumber ?? body?.header?.number ?? '').trim()
  if (!number) return NextResponse.json({ error: 'Invoice number is required' }, { status: 400 })

  const existingInvoice = await prisma.supplierInvoice.findFirst({
    where: { venueId, supplierId: supplier.id, number },
    select: { id: true },
  })
  if (existingInvoice) {
    return NextResponse.json(
      { error: 'INVOICE NUMBER ALREADY EXISTS', invoiceId: existingInvoice.id },
      { status: 409 },
    )
  }

  const rawLines = Array.isArray(body?.lines) ? body.lines : []

  const inventoryIds = [
    ...new Set(
      rawLines
        .map((line) => line.inventoryItemId || line.match?.inventoryItemId)
        .filter((id): id is string => !!id),
    ),
  ]
  if (inventoryIds.length > 0) {
    const items = await prisma.inventoryItem.findMany({
      where: { id: { in: inventoryIds }, venueId, deletedAt: null },
      select: { id: true },
    })
    const found = new Set(items.map((item) => item.id))
    const missing = inventoryIds.filter((id) => !found.has(id))
    if (missing.length > 0) {
      return NextResponse.json({ error: 'An inventory item does not belong to this venue' }, { status: 400 })
    }
  }

  let purchaseOrderId: string | null = null
  let poLines: { id: string; inventoryItemId: string | null; description: string; qty: number; unitPrice: number }[] = []
  if (body?.purchaseOrderId) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: body.purchaseOrderId, venueId, supplierId: supplier.id, deletedAt: null },
      include: { lines: { where: { deletedAt: null } } },
    })
    if (!po) return NextResponse.json({ error: 'Purchase order not found for this supplier' }, { status: 400 })
    purchaseOrderId = po.id
    poLines = po.lines.map((line) => ({
      id: line.id,
      inventoryItemId: line.inventoryItemId,
      description: line.description,
      qty: line.qty,
      unitPrice: line.unitPrice,
    }))
  }
  const poLineById = new Map(poLines.map((line) => [line.id, line]))

  const lineData = rawLines.map((line) => {
    const inventoryItemId = line.inventoryItemId || line.match?.inventoryItemId || null
    const qty = toFiniteNumber(line.qty) ?? 0
    const unitPrice = toFiniteNumber(line.unitPrice) ?? 0
    const description = String(line.description ?? '').trim()

    let purchaseOrderLineId = line.purchaseOrderLineId || line.poLine?.id || null
    if (!purchaseOrderLineId && inventoryItemId && poLines.length > 0) {
      const byItem = poLines.find((candidate) => candidate.inventoryItemId === inventoryItemId)
      if (byItem) purchaseOrderLineId = byItem.id
    }
    let matchStatus: 'UNMATCHED' | 'MATCHED' | 'VARIANCE' = inventoryItemId ? 'MATCHED' : 'UNMATCHED'
    if (purchaseOrderLineId && poLineById.has(purchaseOrderLineId)) {
      const poLine = poLineById.get(purchaseOrderLineId)!
      const comparison = compareLineToPurchaseOrder(
        { qty, unitPrice },
        { qty: poLine.qty, unitPrice: poLine.unitPrice },
      )
      if (comparison.status === 'VARIANCE') matchStatus = 'VARIANCE'
    } else {
      purchaseOrderLineId = null
    }

    return {
      inventoryItemId,
      supplierSku: line.supplierSku || null,
      description,
      qty,
      uomId: line.uomId || null,
      unitPrice,
      lineTotal: lineTotals({ qty, unitPrice }),
      matchStatus,
      purchaseOrderLineId,
    }
  })

  const totals = invoiceTotals(lineData)

  let status: 'DRAFT' | 'PENDING_MATCH' | 'MATCHED' | 'VARIANCE' = 'MATCHED'
  if (lineData.length === 0) status = 'DRAFT'
  else if (lineData.some((line) => line.matchStatus === 'VARIANCE')) status = 'VARIANCE'
  else if (!lineData.every((line) => line.matchStatus === 'MATCHED')) status = 'PENDING_MATCH'

  const confirmAliases = body?.confirmAliases !== false
  const confirmItemCodes = body?.confirmItemCodes !== false
  const summary = { created: 1, matched: 0, unmatched: 0, variance: 0, aliases: 0, itemCodes: 0 }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.supplierInvoice.create({
      data: {
        venueId,
        supplierId: supplier.id,
        number,
        invoiceDate: body?.header?.invoiceDate ? new Date(body.header.invoiceDate) : null,
        dueDate: body?.header?.dueDate ? new Date(body.header.dueDate) : null,
        status,
        currency: body?.header?.currency || 'NZD',
        fileUrl: body?.fileUrl ?? null,
        purchaseOrderId,
        notes: body?.header?.notes ?? null,
        subtotal: round2(totals.subtotal),
        gst: round2(totals.gst),
        total: round2(totals.total),
        lines: { create: lineData },
      },
    })

    for (const line of lineData) {
      if (line.matchStatus === 'MATCHED') summary.matched++
      else if (line.matchStatus === 'VARIANCE') summary.variance++
      else summary.unmatched++

      if (!line.inventoryItemId) continue

      if (confirmItemCodes && line.supplierSku) {
        await tx.supplierItemCode.upsert({
          where: {
            supplierId_inventoryItemId: { supplierId: supplier.id, inventoryItemId: line.inventoryItemId },
          },
          update: { supplierSku: line.supplierSku, deletedAt: null },
          create: {
            supplierId: supplier.id,
            inventoryItemId: line.inventoryItemId,
            supplierSku: line.supplierSku,
          },
        })
        summary.itemCodes++
      }

      if (confirmAliases) {
        const key = normaliseInvoiceText(line.description)
        if (key) {
          await tx.supplierItemAlias.upsert({
            where: { supplierId_normalisedTextKey: { supplierId: supplier.id, normalisedTextKey: key } },
            update: { inventoryItemId: line.inventoryItemId, source: 'IMPORT', deletedAt: null },
            create: {
              supplierId: supplier.id,
              normalisedTextKey: key,
              inventoryItemId: line.inventoryItemId,
              source: 'IMPORT',
            },
          })
          summary.aliases++
        }
      }
    }

    const full = await tx.supplierInvoice.findUnique({
      where: { id: created.id },
      include: {
        supplier: { select: { id: true, name: true } },
        lines: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    })
    return full ?? created
  })

  return NextResponse.json({ invoice, summary }, { status: 201 })
}
