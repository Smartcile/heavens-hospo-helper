import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { deliveryLineVerdict, vehicleVerdict, deliveryAlertSeverity } from '@/lib/food-safety'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const delivery = await prisma.delivery.findUnique({
    where: { id: params.id },
    include: {
      supplier: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, firstName: true, lastName: true } },
      items: { include: { alerts: { select: { id: true, severity: true, status: true } } } },
    },
  })
  if (!delivery) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(delivery)
}

// Edit the receipt: replace the line items wholesale (like the recipe editor),
// recompute verdicts server-side, and keep the alert feed consistent — open
// alerts for lines that no longer fail are closed, new failures raise alerts.
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const items: {
    inventoryItemId: string
    itemName?: string
    storageType?: 'AMBIENT' | 'CHILLED' | 'FROZEN'
    qty?: number | null
    unit?: string | null
    temp?: number | null
    disposition?: 'ACCEPTED' | 'REJECTED'
    note?: string | null
  }[] = Array.isArray(body.items) ? body.items : []

  const vehicleTemp = body.vehicleTemp != null && Number.isFinite(body.vehicleTemp) ? Number(body.vehicleTemp) : null
  const vehicleVerdictValue = vehicleVerdict(vehicleTemp, items.map((i) => i.storageType ?? 'AMBIENT'))

  const oldItems = await prisma.deliveryItem.findMany({
    where: { deliveryId: params.id },
    select: { id: true },
  })

  const delivery = await prisma.$transaction(async (tx) => {
    await tx.deliveryItem.deleteMany({ where: { deliveryId: params.id } })
    const updated = await tx.delivery.update({
      where: { id: params.id },
      data: {
        supplierId: body.supplierId ?? null,
        supplierName: String(body.supplierName ?? '').toUpperCase().trim() || undefined,
        deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : undefined,
        vehicleTemp,
        vehicleVerdict: vehicleVerdictValue,
        invoiceRef: body.invoiceRef ?? null,
        notes: body.notes ?? null,
      },
    })
    await tx.deliveryItem.createMany({
      data: items.map((line) => ({
        deliveryId: params.id,
        inventoryItemId: line.inventoryItemId,
        itemName: String(line.itemName ?? 'ITEM').toUpperCase().trim(),
        storageType: line.storageType ?? 'AMBIENT',
        qty: line.qty ?? null,
        unit: line.unit ?? null,
        temp: line.temp ?? null,
        verdict: deliveryLineVerdict(line.temp, line.storageType ?? 'AMBIENT'),
        disposition: line.disposition ?? 'ACCEPTED',
        note: line.note ?? null,
      })),
    })
    // Close alerts for lines removed by this edit.
    if (oldItems.length > 0) {
      await tx.hsAlert.updateMany({
        where: { deliveryItemId: { in: oldItems.map((i) => i.id) }, status: 'OPEN', deletedAt: null },
        data: { status: 'RESOLVED', resolvedById: session.user.id, resolvedAt: new Date(), resolutionNote: 'DELIVERY EDITED' },
      })
    }
    return updated
  })

  // New failures raise fresh alerts. Best-effort.
  try {
    const created = await prisma.deliveryItem.findMany({
      where: { deliveryId: params.id, verdict: 'FAIL' },
      select: { id: true, itemName: true, storageType: true, temp: true },
    })
    if (created.length > 0) {
      await prisma.hsAlert.createMany({
        data: created.map((item) => ({
          venueId: delivery.venueId,
          deliveryItemId: item.id,
          severity: deliveryAlertSeverity(item.temp, item.storageType),
          kind: 'DELIVERY_TEMP' as const,
          message: `${item.itemName} received at ${item.temp ?? '?'}°C — ${item.storageType === 'FROZEN' ? 'frozen goods must be ≤ -18°C' : item.storageType === 'CHILLED' ? 'chilled goods must be ≤ 5°C' : 'check required'}`,
          value: item.temp,
        })),
      })
    }
  } catch { /* ignore */ }

  return NextResponse.json(delivery)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.delivery.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
