import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import {
  applyReceipt,
  purchaseOrderStatusFromLines,
  type PurchaseOrderStatus,
} from '@/lib/purchasing'
import { buildPriceMovement, shouldAlert } from '@/lib/price-movements'
import {
  deliveryLineVerdict,
  vehicleVerdict,
  deliveryAlertSeverity,
  type StorageTypeId,
  type Verdict,
} from '@/lib/food-safety'
import { resolvePurchasingVenue, toFiniteNumber } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

interface ReceiptLine {
  lineId?: string
  qty?: unknown
  unitPrice?: unknown
  temp?: number | null
  note?: string | null
}

type ReceivedLine = ReceiptLine & { lineId: string }

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    deliveredAt?: string | null
    vehicleTemp?: number | null
    invoiceRef?: string | null
    notes?: string | null
    lines?: ReceiptLine[]
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, venueId, deletedAt: null },
    include: {
      supplier: { select: { id: true, name: true } },
      lines: { where: { deletedAt: null } },
    },
  })
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const receipt = (Array.isArray(body?.lines) ? body.lines : []).filter(
    (line): line is ReceivedLine => !!line && !!line.lineId,
  )
  if (receipt.length === 0) return NextResponse.json({ error: 'At least one line is required' }, { status: 400 })

  const lineById = new Map(order.lines.map((line) => [line.id, line]))
  if (receipt.some((line) => !lineById.has(line.lineId!))) {
    return NextResponse.json({ error: 'A receipt line does not belong to this purchase order' }, { status: 400 })
  }
  if (receipt.some((line) => (toFiniteNumber(line.qty) ?? 0) <= 0)) {
    return NextResponse.json({ error: 'Every receipt line must have qty > 0' }, { status: 400 })
  }

  const inventoryIds = [
    ...new Set(
      receipt
        .map((line) => lineById.get(line.lineId!)?.inventoryItemId)
        .filter((id): id is string => !!id),
    ),
  ]

  const [items, existingCodes] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { id: { in: inventoryIds } },
      select: { id: true, name: true, unit: true, storageType: true, costPrice: true },
    }),
    prisma.supplierItemCode.findMany({
      where: { supplierId: order.supplierId, inventoryItemId: { in: inventoryIds } },
    }),
  ])
  const itemById = new Map(items.map((item) => [item.id, item]))
  const codeByItem = new Map(existingCodes.map((code) => [code.inventoryItemId, code]))

  const vehicleTemp =
    body?.vehicleTemp != null && Number.isFinite(body.vehicleTemp) ? Number(body.vehicleTemp) : null
  const storageTypes = receipt
    .map((line) => lineById.get(line.lineId!)?.inventoryItemId)
    .map((id) => (id ? itemById.get(id)?.storageType ?? 'AMBIENT' : 'AMBIENT'))
  const vehicleVerdictValue = vehicleVerdict(vehicleTemp, storageTypes)

  const result = await prisma.$transaction(async (tx) => {
    const delivery = await tx.delivery.create({
      data: {
        venueId,
        supplierId: order.supplierId,
        supplierName: order.supplier?.name ?? 'UNKNOWN SUPPLIER',
        deliveredAt: body?.deliveredAt ? new Date(body.deliveredAt) : new Date(),
        receivedById: session.user.id,
        vehicleTemp,
        vehicleVerdict: vehicleVerdictValue,
        invoiceRef: body?.invoiceRef ?? null,
        notes: body?.notes ?? null,
        purchaseOrderId: order.id,
      },
    })

    const deliveryItems: {
      deliveryId: string
      inventoryItemId: string
      itemName: string
      storageType: StorageTypeId
      qty: number
      unit: string | null
      temp: number | null
      verdict: Verdict
      note: string | null
      purchaseOrderLineId: string
    }[] = []

    const receivedById = new Map<string, number>()
    const priceMovements: {
      inventoryItemId: string
      oldPrice: number | null
      newPrice: number
      delta: number
      percent: number | null
      direction: string
      alert: boolean
    }[] = []

    const priceByLine = new Map<string, number>()

    for (const line of receipt) {
      const poLine = lineById.get(line.lineId!)!
      const incoming = toFiniteNumber(line.qty) ?? 0
      const applied = applyReceipt(
        { qty: poLine.qty, unitPrice: poLine.unitPrice, receivedQty: poLine.receivedQty },
        incoming,
      )
      const receivedPrice = toFiniteNumber(line.unitPrice) ?? poLine.unitPrice
      priceByLine.set(poLine.id, receivedPrice)

      await tx.purchaseOrderLine.update({
        where: { id: poLine.id },
        data: { receivedQty: applied.receivedQty },
      })

      const item = poLine.inventoryItemId ? itemById.get(poLine.inventoryItemId) : undefined
      const storageType = (item?.storageType ?? 'AMBIENT') as StorageTypeId
      const temp = line.temp != null && Number.isFinite(line.temp) ? Number(line.temp) : null

      if (poLine.inventoryItemId && item) {
        deliveryItems.push({
          deliveryId: delivery.id,
          inventoryItemId: poLine.inventoryItemId,
          itemName: item.name,
          storageType,
          qty: incoming,
          unit: item.unit ?? null,
          temp,
          verdict: deliveryLineVerdict(temp, storageType),
          note: line.note ?? null,
          purchaseOrderLineId: poLine.id,
        })
      }

      receivedById.set(poLine.id, applied.receivedQty)
    }

    if (deliveryItems.length > 0) {
      await tx.deliveryItem.createMany({ data: deliveryItems })
    }

    // Goods receipt is the price-change moment: compare the received price with
    // the last known supplier price (falling back to the item's cost) and record
    // a movement + update the item cost / supplier code. A supplier code cannot
    // be created without a SKU, so only an existing code is refreshed here.
    for (const line of receipt) {
      const poLine = lineById.get(line.lineId!)!
      if (!poLine.inventoryItemId) continue
      const item = itemById.get(poLine.inventoryItemId)
      if (!item) continue
      const newPrice = priceByLine.get(poLine.id) ?? poLine.unitPrice
      const code = codeByItem.get(poLine.inventoryItemId)
      const oldPrice = code?.purchasePrice ?? item.costPrice ?? null
      const movement = buildPriceMovement({
        oldPrice,
        newPrice,
        itemName: item.name,
        source: 'RECEIPT',
      })
      if (!movement.changed) continue

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { costPrice: newPrice },
      })
      if (code) {
        await tx.supplierItemCode.update({
          where: { id: code.id },
          data: { purchasePrice: newPrice, deletedAt: null },
        })
      }
      await tx.supplierPriceMovement.create({
        data: {
          venueId,
          supplierId: order.supplierId,
          inventoryItemId: item.id,
          source: 'RECEIPT',
          sourceId: delivery.id,
          oldPrice,
          newPrice,
          delta: movement.delta,
          percent: movement.percent,
        },
      })
      priceMovements.push({
        inventoryItemId: item.id,
        oldPrice,
        newPrice,
        delta: movement.delta,
        percent: movement.percent,
        direction: movement.direction,
        alert: shouldAlert(movement),
      })
    }

    // Status must consider ALL lines, not only the ones in this receipt - a
    // partial receipt of one line must not mark the whole PO RECEIVED.
    const status: PurchaseOrderStatus = purchaseOrderStatusFromLines(
      order.lines.map((line) => ({
        qty: line.qty,
        unitPrice: line.unitPrice,
        receivedQty: receivedById.get(line.id) ?? line.receivedQty,
      })),
      order.status as PurchaseOrderStatus,
    )
    const purchaseOrder = await tx.purchaseOrder.update({
      where: { id: order.id },
      data: { status },
      include: { lines: { where: { deletedAt: null } }, supplier: { select: { id: true, name: true } } },
    })

    return { purchaseOrder, delivery, priceMovements }
  })

  // Failed delivery lines raise DELIVERY_TEMP alerts (best-effort — never block
  // the receipt). Mirrors /api/admin/deliveries.
  try {
    const failed = await prisma.deliveryItem.findMany({
      where: { deliveryId: result.delivery.id, verdict: 'FAIL' },
      select: { id: true, itemName: true, storageType: true, temp: true },
    })
    if (failed.length > 0) {
      await prisma.hsAlert.createMany({
        data: failed.map((item) => ({
          venueId,
          deliveryItemId: item.id,
          severity: deliveryAlertSeverity(item.temp, item.storageType),
          kind: 'DELIVERY_TEMP' as const,
          message: `${item.itemName} received at ${item.temp ?? '?'}°C — ${
            item.storageType === 'FROZEN'
              ? 'frozen goods must be ≤ -18°C'
              : item.storageType === 'CHILLED'
                ? 'chilled goods must be ≤ 5°C'
                : 'check required'
          }`,
          value: item.temp,
        })),
      })
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json(result)
}
