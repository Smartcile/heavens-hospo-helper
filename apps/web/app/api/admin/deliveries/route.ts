import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import {
  deliveryLineVerdict,
  vehicleVerdict,
  deliveryAlertSeverity,
  type Verdict,
} from '@/lib/food-safety'

interface DeliveryLineInput {
  inventoryItemId: string
  itemName?: string
  storageType?: 'AMBIENT' | 'CHILLED' | 'FROZEN'
  qty?: number | null
  unit?: string | null
  temp?: number | null
  disposition?: 'ACCEPTED' | 'REJECTED'
  note?: string | null
}

// List deliveries for a date (+ optional search) with items, supplier and
// receiver; the payload also carries the venue's product catalog (id/name/
// storageType/unit only) so both the admin and worker clients can build the
// line-entry search without a heavy inventory fetch.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const venueId = searchParams.get('venueId') ?? (session.user.role === 'MANAGER' ? session.user.venueId : undefined)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const where: Record<string, unknown> = { venueId, deletedAt: null }
  if (date) {
    const day = new Date(date)
    const next = new Date(day.getTime() + 24 * 60 * 60 * 1000)
    where.deliveredAt = { gte: day, lt: next }
  }

  const [deliveries, catalog, suppliers] = await Promise.all([
    prisma.delivery.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, firstName: true, lastName: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { deliveredAt: 'desc' },
    }),
    prisma.inventoryItem.findMany({
      where: { venueId, deletedAt: null, isActive: true },
      select: { id: true, name: true, storageType: true, unit: true },
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.findMany({
      where: { venueId, deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({ deliveries, catalog, suppliers })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const items: DeliveryLineInput[] = Array.isArray(body.items) ? body.items : []
  const supplierId = body.supplierId ?? null
  const supplier = supplierId
    ? await prisma.supplier.findFirst({ where: { id: supplierId, venueId }, select: { id: true, name: true } })
    : null

  // Verdicts are computed server-side — the authoritative pass/fail.
  const lineVerdicts = new Map<string, Verdict>()
  const itemStorage = new Map<string, string>()
  for (const line of items) {
    const storageType = line.storageType ?? 'AMBIENT'
    itemStorage.set(line.inventoryItemId, storageType)
    lineVerdicts.set(line.inventoryItemId, deliveryLineVerdict(line.temp, storageType))
  }
  const vehicleTemp = body.vehicleTemp != null && Number.isFinite(body.vehicleTemp) ? Number(body.vehicleTemp) : null
  const vehicleVerdictValue = vehicleVerdict(vehicleTemp, items.map((i) => itemStorage.get(i.inventoryItemId) ?? 'AMBIENT'))

  const delivery = await prisma.delivery.create({
    data: {
      venueId,
      supplierId,
      supplierName: supplier?.name ?? String(body.supplierName ?? 'UNKNOWN SUPPLIER').toUpperCase().trim(),
      deliveredAt: body.deliveredAt ? new Date(body.deliveredAt) : new Date(),
      receivedById: session.user.id,
      vehicleTemp,
      vehicleVerdict: vehicleVerdictValue,
      invoiceRef: body.invoiceRef ?? null,
      notes: body.notes ?? null,
    },
  })

  await prisma.deliveryItem.createMany({
    data: items.map((line) => {
      const storageType = line.storageType ?? 'AMBIENT'
      return {
        deliveryId: delivery.id,
        inventoryItemId: line.inventoryItemId,
        itemName: String(line.itemName ?? 'ITEM').toUpperCase().trim(),
        storageType,
        qty: line.qty ?? null,
        unit: line.unit ?? null,
        temp: line.temp ?? null,
        verdict: lineVerdicts.get(line.inventoryItemId) ?? 'NA',
        disposition: line.disposition ?? 'ACCEPTED',
        note: line.note ?? null,
      }
    }),
  })

  // Failed lines raise DELIVERY_TEMP alerts (CRITICAL when goods are likely
  // lost). Best-effort — never block the save.
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
            venueId,
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
