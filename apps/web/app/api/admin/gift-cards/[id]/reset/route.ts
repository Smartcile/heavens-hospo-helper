import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { logGiftCardEvent } from '@/lib/gift-card-history'
import { guardAccess } from '@/lib/permissions'

/**
 * POST /api/admin/gift-cards/:id/reset
 *
 * Return an issued/voided card to a blank DRAFT so it can be sold/issued again
 * with the SAME number: clears amount, customer fields, message, PDF and the
 * linked order; keeps the number and the FULL history (a RESET event is
 * appended — history is never removed). Cards involved in a replacement chain
 * (either side) are retired for good and cannot be reset — their numbers are
 * out of circulation on purpose.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.redeem')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!['ISSUED', 'SENT', 'VOIDED'].includes(card.status)) {
    return NextResponse.json(
      { error: `CARD #${card.number} IS ${card.status} — ONLY ISSUED / SENT / VOIDED CARDS CAN BE RESET` },
      { status: 400 },
    )
  }
  if (card.replacesId) {
    return NextResponse.json(
      { error: `CARD #${card.number} IS ITSELF A REPLACEMENT — ITS NUMBER IS RETIRED AND CANNOT BE RESET` },
      { status: 400 },
    )
  }
  if (card.status === 'VOIDED') {
    const replacedBy = await prisma.giftCard.findFirst({
      where: { venueId: card.venueId, replacesId: card.id, deletedAt: null },
      select: { number: true },
    })
    if (replacedBy) {
      return NextResponse.json(
        { error: `CARD #${card.number} WAS REPLACED BY #${replacedBy.number} — ITS NUMBER IS RETIRED AND CANNOT BE RESET` },
        { status: 400 },
      )
    }
  }

  await prisma.giftCard.update({
    where: { id: params.id },
    data: {
      status: 'DRAFT',
      amount: 0,
      customerName: null,
      customerEmail: null,
      message: null,
      pdfPath: null,
      issuedAt: null,
      sentAt: null,
      expiresAt: null,
      wooOrderId: null,
    },
  })

  await logGiftCardEvent(
    params.id,
    'RESET',
    `RESET TO A BLANK DRAFT — CUSTOMER DETAILS, AMOUNT AND PDF CLEARED (HISTORY KEPT)`,
  )

  const updated = await prisma.giftCard.findUnique({ where: { id: params.id } })
  return NextResponse.json(updated)
}
