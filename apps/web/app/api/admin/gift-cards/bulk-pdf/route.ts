import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { generateGiftCardPdf, giftCardPdfToBuffer } from '@/lib/gift-card-pdf'
import { fillGiftCardTemplate, mergePdfBuffers, GiftCardFieldMapping } from '@/lib/gift-card-template'
import { formatDate } from '@/lib/utils'
import { readFileSync, existsSync } from 'fs'

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

  const template = await prisma.giftCardTemplate.findFirst({
    where: { venueId: session.user.venueId, isActive: true, deletedAt: null },
  })

  const buffers: Buffer[] = []
  for (const card of cards) {
    const issueDate = formatDate(card.issuedAt ?? card.createdAt)
    if (template && existsSync(template.filePath)) {
      buffers.push(
        await fillGiftCardTemplate(
          readFileSync(template.filePath),
          (template.fieldMapping as unknown as GiftCardFieldMapping[]) ?? [],
          {
            number: card.number,
            amount: card.amount,
            customerName: card.customerName || '',
            issueDate,
            message: card.message || undefined,
          },
        ),
      )
    } else {
      buffers.push(
        giftCardPdfToBuffer(
          generateGiftCardPdf({
            number: card.number,
            amount: card.amount,
            customerName: card.customerName || '',
            issueDate,
            message: card.message || undefined,
          }),
        ),
      )
    }
  }

  const merged = await mergePdfBuffers(buffers)
  return new NextResponse(new Uint8Array(merged), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Gift Cards - ${cards.length} cards.pdf"`,
    },
  })
}
