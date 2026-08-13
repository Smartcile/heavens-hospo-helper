import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { deliveryLineVerdict, vehicleVerdict, deliveryAlertSeverity } from '@/lib/food-safety'

// Worker receipt flow: the phone shows recent deliveries + the product catalog
// + the supplier list in one round trip, then POSTs the receipt. Venue and
// receiver come from the JWT — staff can only record for their own venue.
export async function GET(_req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [deliveries, catalog, suppliers] = await Promise.all([
    prisma.delivery.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      include: {
        supplier: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { deliveredAt: 'desc' },
      take: 30,
    }),
    prisma.inventoryItem.findMany({
      where: { venueId: session.venueId, deletedAt: null, isActive: true },
      select: { id: true, name: true, storageType: true, unit: true },
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.findMany({
      where: { venueId: session.venueId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({ deliveries, catalog, suppliers, firstName: session.firstName })
}

export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
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

  if (items.length === 0) {
    return NextResponse.json({ error: 'Add at least one line item' }, { status: 400 })
  }

  const supplierId = body.supplierId ?? null
  const supplier = supplierId
    ? await prisma.supplier.findFirst({ where: { id: supplierId, venueId: session.venueId }, select: { id: true, name: true } })
    : null

  const vehicleTemp = body.vehicleTemp != null && Number.isFinite(body.vehicleTemp) ? Number(body.vehicleTemp) : null
  const vehicleVerdictValue = vehicleVerdict(vehicleTemp, items.map((i) => i.storageType ?? 'AMBIENT'))

  const delivery = await prisma.delivery.create({
    data: {
      venueId: session.venueId,
      supplierId,
      supplierName: supplier?.name ?? String(body.supplierName ?? 'UNKNOWN SUPPLIER').toUpperCase().trim(),
      deliveredAt: new Date(),
      receivedById: session.staffId,
      vehicleTemp,
      vehicleVerdict: vehicleVerdictValue,
      invoiceRef: body.invoiceRef ?? null,
      notes: body.notes ?? null,
    },
  })

  await prisma.deliveryItem.createMany({
    data: items.map((line) => ({
      deliveryId: delivery.id,
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

  // Failed lines raise DELIVERY_TEMP alerts — the manager sees them in the
  // Compliance ALERTS tab. Best-effort.
  const createdItems = await prisma.deliveryItem.findMany({
    where: { deliveryId: delivery.id },
    select: { id: true, inventoryItemId: true, verdict: true },
  })
  const failedItems = createdItems.filter((i) => i.verdict === 'FAIL')
  if (failedItems.length > 0) {
    try {
      await prisma.hsAlert.createMany({
        data: failedItems.map((item) => {
          const line = items.find((l) => l.inventoryItemId === item.inventoryItemId) ?? items[0]
          const storageType = line?.storageType ?? 'AMBIENT'
          return {
            venueId: session.venueId,
            deliveryItemId: item.id,
            severity: deliveryAlertSeverity(line?.temp, storageType),
            kind: 'DELIVERY_TEMP' as const,
            message: `${line?.itemName ?? 'ITEM'} received at ${line?.temp ?? '?'}°C — ${storageType === 'FROZEN' ? 'frozen goods must be ≤ -18°C' : storageType === 'CHILLED' ? 'chilled goods must be ≤ 5°C' : 'check required'}`,
            value: line?.temp ?? null,
          }
        }),
      })
    } catch { /* ignore */ }
  }

  return NextResponse.json(delivery, { status: 201 })
}
