import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { formatDate } from '@/lib/utils'
import { guardAccess } from '@/lib/permissions'

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
    select: { id: true, venueId: true },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { customerName, customerEmail, amount, message, notes, status } = await req.json()

  const data: Record<string, unknown> = {}
  if (customerName !== undefined) data.customerName = customerName || null
  if (customerEmail !== undefined) data.customerEmail = customerEmail || null
  if (amount !== undefined) data.amount = amount
  if (message !== undefined) data.message = message || null
  if (notes !== undefined) data.notes = notes || null
  if (status !== undefined) data.status = status

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
    select: { id: true },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.giftCard.update({ where: { id: params.id }, data: { deletedAt: new Date() } })

  return NextResponse.json({ success: true })
}
