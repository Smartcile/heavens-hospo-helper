import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { mergedGiftCardPdf } from '@/lib/gift-card-issue'

const MAX_CARDS = 500

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const { cardIds } = await req.json()
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one gift card' }, { status: 400 })
  }
  if (cardIds.length > MAX_CARDS) {
    return NextResponse.json({ error: `Too many cards — max ${MAX_CARDS}` }, { status: 400 })
  }

  const cards = await prisma.giftCard.findMany({
    where: { id: { in: cardIds }, venueId: session.user.venueId, deletedAt: null },
    orderBy: { number: 'asc' },
  })
  if (cards.length === 0) return NextResponse.json({ error: 'No gift cards found' }, { status: 404 })

  const merged = await mergedGiftCardPdf(cards)
  return new NextResponse(new Uint8Array(merged), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Gift Cards - ${cards.length} cards.pdf"`,
    },
  })
}
