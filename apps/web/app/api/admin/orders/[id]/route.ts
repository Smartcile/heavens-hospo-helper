import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { pushOrderStatus } from '@/lib/woo-push'
import { resolveCustomer } from '@/lib/customer-match'
import type { OrderStatus, OrderOpStatus, PaymentStatus, FulfillmentType } from '@prisma/client'

const VALID_STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED']
const VALID_OP_STATUSES: OrderOpStatus[] = [
  'NEW', 'CONFIRMED', 'IN_PREP', 'READY', 'ARRIVED',
  'OUT_FOR_DELIVERY', 'HANDED_OVER', 'FINALISED', 'CANCELLED',
]
const VALID_PAYMENT_STATUSES: PaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED']
const VALID_FULFILLMENT: FulfillmentType[] = ['DINE_IN', 'PICKUP', 'DELIVERY']

/*
 * Timestamps that should be stamped automatically when an order reaches a
 * state, so nobody has to remember to fill them in. Only set on first arrival —
 * moving backwards and forwards through the list must not rewrite history.
 */
const OP_STATUS_STAMPS: Partial<Record<OrderOpStatus, 'arrivedAt' | 'deliveredAt' | 'finalisedAt'>> = {
  ARRIVED: 'arrivedAt',
  HANDED_OVER: 'deliveredAt',
  FINALISED: 'finalisedAt',
}

async function loadScoped(id: string, session: { user: { role: string; venueId: string } }) {
  const order = await prisma.wooOrder.findFirst({
    where: { id, deletedAt: null },
  })
  if (!order) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (session.user.role === 'MANAGER' && order.venueId !== session.user.venueId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { order }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error
  const order = scoped.order!

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }
    data.status = body.status
  }

  if (body.opStatus !== undefined) {
    if (!VALID_OP_STATUSES.includes(body.opStatus)) {
      return NextResponse.json({ error: `opStatus must be one of ${VALID_OP_STATUSES.join(', ')}` }, { status: 400 })
    }
    data.opStatus = body.opStatus

    const stampField = OP_STATUS_STAMPS[body.opStatus as OrderOpStatus]
    if (stampField && !order[stampField]) {
      data[stampField] = new Date()
    }
  }

  if (body.paymentStatus !== undefined) {
    if (!VALID_PAYMENT_STATUSES.includes(body.paymentStatus)) {
      return NextResponse.json({ error: `paymentStatus must be one of ${VALID_PAYMENT_STATUSES.join(', ')}` }, { status: 400 })
    }
    data.paymentStatus = body.paymentStatus
    if (body.paymentStatus === 'PAID' && !order.paidAt) data.paidAt = new Date()
  }

  if (body.fulfillmentType !== undefined) {
    if (!VALID_FULFILLMENT.includes(body.fulfillmentType)) {
      return NextResponse.json({ error: `fulfillmentType must be one of ${VALID_FULFILLMENT.join(', ')}` }, { status: 400 })
    }
    data.fulfillmentType = body.fulfillmentType
  }

  if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod || null
  if (body.serviceTime !== undefined) data.serviceTime = body.serviceTime || null
  if (body.partySize !== undefined) {
    data.partySize = body.partySize === '' || body.partySize == null ? null : Number(body.partySize)
  }
  if (body.notes !== undefined) data.notes = body.notes || null
  if (body.allergenNote !== undefined) data.allergenNote = body.allergenNote || null

  if (body.serviceDate !== undefined) {
    if (body.serviceDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate)) {
      return NextResponse.json({ error: 'serviceDate must be YYYY-MM-DD' }, { status: 400 })
    }
    data.serviceDate = body.serviceDate ? new Date(`${body.serviceDate}T00:00:00.000Z`) : null
  }

  // Contact edits re-run dedupe so a corrected phone number links the order to
  // the right person rather than stranding it.
  if (body.customerName !== undefined || body.customerEmail !== undefined || body.customerPhone !== undefined) {
    const name = body.customerName !== undefined ? body.customerName : order.customerName
    const email = body.customerEmail !== undefined ? body.customerEmail : order.customerEmail
    const phone = body.customerPhone !== undefined ? body.customerPhone : order.customerPhone

    data.customerName = name ? String(name).toUpperCase().trim() : null
    data.customerEmail = email || null
    data.customerPhone = phone || null
    data.customerId = await resolveCustomer(prisma, order.venueId, { name, email, phone })
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No supported fields to update' }, { status: 400 })
  }

  const updated = await prisma.wooOrder.update({ where: { id: params.id }, data })

  // Only the WooCommerce-owned status pushes back, and only for Woo orders —
  // pushOrderStatus itself no-ops on local orders.
  if (data.status !== undefined) await pushOrderStatus(updated.id)

  return NextResponse.json(updated)
}

/** Replace the line items of an order. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  const body = await req.json()
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  const lines = body.items.filter((l: { menuItemId?: string }) => l?.menuItemId)

  await prisma.$transaction(async (tx) => {
    const existing = await tx.wooOrderItem.findMany({
      where: { orderId: params.id },
      select: { id: true },
    })
    const keep = new Set<string>()

    for (const l of lines) {
      const payload = {
        qty: Number(l.qty) || 1,
        unitPrice: l.unitPrice == null || l.unitPrice === '' ? null : Number(l.unitPrice),
        customerNote: l.customerNote || null,
        allergenNote: l.allergenNote || null,
      }

      if (l.id && existing.some((e) => e.id === l.id)) {
        await tx.wooOrderItem.update({ where: { id: l.id }, data: payload })
        keep.add(l.id)
      } else {
        const created = await tx.wooOrderItem.create({
          data: { orderId: params.id, menuItemId: l.menuItemId, ...payload },
        })
        keep.add(created.id)
      }
    }

    const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id)
    if (remove.length > 0) await tx.wooOrderItem.deleteMany({ where: { id: { in: remove } } })

    const total = lines.reduce(
      (sum: number, l: { unitPrice?: number; qty?: number }) =>
        sum + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0),
      0,
    )
    await tx.wooOrder.update({ where: { id: params.id }, data: { totalAmount: total } })
  })

  const updated = await prisma.wooOrder.findUnique({
    where: { id: params.id },
    include: { items: { include: { menuItem: { select: { id: true, name: true } } } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  await prisma.wooOrder.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
