import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getNextNumber } from '@/lib/gift-cards'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const search = url.searchParams.get('search')
  const year = url.searchParams.get('year')

  const where: Record<string, unknown> = { venueId: session.user.venueId, deletedAt: null }

  if (status) where.status = status.toUpperCase()
  if (year) where.number = { startsWith: year }
  if (search) {
    where.OR = [
      { number: { contains: search } },
      { customerName: { contains: search, mode: 'insensitive' } },
      { customerEmail: { contains: search, mode: 'insensitive' } },
    ]
  }

  const cards = await prisma.giftCard.findMany({
    where: where as any,
    orderBy: { number: 'desc' },
    take: 200,
  })

  return NextResponse.json(cards)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { customerName, customerEmail, amount, message } = await req.json()

  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount is required' }, { status: 400 })

  const year = new Date().getFullYear()
  const number = await getNextNumber(session.user.venueId, year)

  const card = await prisma.giftCard.create({
    data: {
      venueId: session.user.venueId,
      number,
      amount,
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      message: message || null,
    },
  })

  return NextResponse.json(card, { status: 201 })
}
