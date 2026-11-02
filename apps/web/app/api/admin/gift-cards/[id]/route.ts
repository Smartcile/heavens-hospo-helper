import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { appendHistoryEvent, type GiftCardHistoryEvent } from '@/lib/gift-card-history'

const STATUSES = ['DRAFT', 'ISSUED', 'SENT', 'REDEEMED', 'VOIDED', 'EXPIRED']

const FIELD_LABELS: Record<string, string> = {
  customerName: 'CUSTOMER NAME',
  customerEmail: 'CUSTOMER EMAIL',
  amount: 'AMOUNT',
  message: 'MESSAGE',
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'performance.giftcards.view')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
    include: { wooOrder: { select: { wooOrderId: true, customerName: true } } },
  })

  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(card)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.redeem')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
    select: {
      id: true, customerName: true, customerEmail: true, amount: true, message: true,
      notes: true, status: true, history: true,
    },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { customerName, customerEmail, amount, message, notes, status } = await req.json()

  const data: Record<string, unknown> = {}
  if (customerName !== undefined) data.customerName = customerName || null
  if (customerEmail !== undefined) data.customerEmail = customerEmail || null
  if (amount !== undefined) data.amount = amount
  if (message !== undefined) data.message = message || null
  if (notes !== undefined) data.notes = notes || null
  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ error: `Invalid status "${status}"` }, { status: 400 })
    }
    data.status = status
  }

  // Record what actually changed in the lifecycle log.
  const history = (card.history as unknown as GiftCardHistoryEvent[]) ?? []
  const events: GiftCardHistoryEvent[] = []
  if (status && status !== card.status) {
    events.push(...appendHistoryEvent(history, 'STATUS', `${card.status} → ${status}`))
  }
  if (notes !== undefined && notes !== card.notes) {
    events.push(...appendHistoryEvent(history, 'NOTE', notes?.trim() ? `"${notes.trim()}"` : 'NOTE REMOVED'))
  }
  const changedFields: string[] = []
  if (customerName !== undefined && (customerName || null) !== card.customerName) changedFields.push('customerName')
  if (customerEmail !== undefined && (customerEmail || null) !== card.customerEmail) changedFields.push('customerEmail')
  if (message !== undefined && (message || null) !== card.message) changedFields.push('message')
  if (amount !== undefined && Number(amount) !== card.amount) changedFields.push('amount')
  if (changedFields.length > 0) {
    const labels = changedFields.map((f) => FIELD_LABELS[f] ?? f)
    events.push(...appendHistoryEvent(history, 'DETAILS_UPDATED', labels.join(', ')))
  }

  if (events.length > 0) {
    data.history = JSON.parse(JSON.stringify(events))
  }

  const updated = await prisma.giftCard.update({ where: { id: params.id }, data })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'performance.giftcards.redeem')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
    select: { id: true, status: true, number: true },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cards are only ever deleted AFTER they have been voided — a soft delete
  // frees the number, so it must never carry live value.
  if (card.status !== 'VOIDED') {
    return NextResponse.json(
      { error: `CARD #${card.number} IS ${card.status} — VOID IT BEFORE DELETING` },
      { status: 400 },
    )
  }

  await prisma.giftCard.update({ where: { id: params.id }, data: { deletedAt: new Date() } })

  return NextResponse.json({ success: true })
}
