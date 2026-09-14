import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { premadeCards } from '@/lib/gift-cards'
import { giftCardSortValue } from '@/lib/gift-card-numbers'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

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
    take: 200,
    include: { wooOrder: { select: { orderNumber: true } } },
  })
  // Numeric order: newest year-series number first (e.g. 20260018 → 20260001).
  cards.sort((a, b) => giftCardSortValue(b.number) - giftCardSortValue(a.number))

  // Flat `wooOrderNumber` for the list UI; the nested wooOrder stays for
  // anything else that wants it.
  const flat = cards.map((c) => ({
    ...c,
    wooOrderNumber: (c.wooOrder as { orderNumber: string | null } | null)?.orderNumber ?? null,
  }))

  return NextResponse.json(flat)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.redeem')
  if (denied) return denied

  // Premake ONE blank draft — the next number in the current year's series.
  // Issuing never invents numbers; it consumes these premade drafts.
  let numbers: string[]
  try {
    numbers = await premadeCards(session.user.venueId, 1)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const card = await prisma.giftCard.findFirst({
    where: { venueId: session.user.venueId, number: numbers[0], deletedAt: null },
  })

  return NextResponse.json(card, { status: 201 })
}
