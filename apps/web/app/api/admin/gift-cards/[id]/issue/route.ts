import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { issueGiftCardPdf } from '@/lib/gift-card-issue'
import { logGiftCardEvent } from '@/lib/gift-card-history'
import { guardAccess } from '@/lib/permissions'

/**
 * POST /api/admin/gift-cards/:id/issue
 *
 * Issue a SPECIFIC premade draft (chosen from the list). The claim only wins
 * while the row is still DRAFT, so a draft shown on a stale screen can never
 * be issued twice — a lost race returns 409 and the UI refreshes.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { customerName, customerEmail, amount, message, isInternal } = await req.json()

  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount is required' }, { status: 400 })

  const pdfPath = await issueGiftCardPdf({
    venueId: card.venueId,
    number: card.number,
    amount,
    customerName: customerName || null,
    message: message || null,
  })

  const claimed = await prisma.giftCard.updateMany({
    where: { id: params.id, status: 'DRAFT', deletedAt: null },
    data: {
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      amount,
      message: message || null,
      isInternal: isInternal ?? false,
      pdfPath,
      status: 'ISSUED',
      issuedAt: new Date(),
    },
  })
  if (claimed.count !== 1) {
    return NextResponse.json({ error: 'CARD NO LONGER AVAILABLE — IT WAS ISSUED ELSEWHERE. REFRESH THE LIST.' }, { status: 409 })
  }

  await logGiftCardEvent(params.id, 'ISSUED', `AMOUNT $${Number(amount).toFixed(2)} — PDF GENERATED`)

  const updated = await prisma.giftCard.findUnique({ where: { id: params.id } })
  return NextResponse.json(updated)
}
