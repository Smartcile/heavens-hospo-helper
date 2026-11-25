import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import fs from 'fs'
import { guardAccess } from '@/lib/permissions'
import { issueGiftCardPdf } from '@/lib/gift-card-issue'
import { logGiftCardEvent } from '@/lib/gift-card-history'
import { remainingBalance } from '@/lib/gift-card-redemption'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'performance.giftcards.view')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!card.pdfPath || !fs.existsSync(card.pdfPath)) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  }

  const buffer = fs.readFileSync(card.pdfPath)
  // `?inline=1` renders the PDF in an iframe (the card popup preview);
  // the default stays an attachment download.
  const inline = _req.nextUrl.searchParams.get('inline') === '1'
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="Gift Card - ${card.number}.pdf"`,
    },
  })
}

/**
 * POST /api/admin/gift-cards/:id/pdf — reprint the card from its CURRENT row.
 *
 * The stored PDF is a one-time snapshot written at issue time, so a top-up
 * (editing AMOUNT) leaves the printed card showing the old value. This rebuilds
 * it through the SAME template-resolution path as issue (`issueGiftCardPdf` →
 * active template, else the built-in design), overwrites `pdfPath` and appends
 * a PDF_UPDATED history event. It is a straight reprint — no statement page —
 * and redemptions never call it automatically: spending the balance is not a
 * change the printed card should show.
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

  // A DRAFT has never been issued, so there is no printed card to update.
  if (card.status === 'DRAFT' || !card.pdfPath) {
    return NextResponse.json(
      { error: `CARD #${card.number} HAS NO ISSUED PDF — ISSUE IT FIRST` },
      { status: 409 },
    )
  }

  const pdfPath = await issueGiftCardPdf({
    venueId: card.venueId,
    number: card.number,
    amount: card.amount,
    customerName: card.customerName,
    message: card.message,
    issuedAt: card.issuedAt,
    createdAt: card.createdAt,
  })

  await prisma.giftCard.update({ where: { id: card.id }, data: { pdfPath } })

  const balance = remainingBalance(card)
  await logGiftCardEvent(
    card.id,
    'PDF_UPDATED',
    `PDF UPDATED — AMOUNT $${Number(card.amount).toFixed(2)} · $${balance.toFixed(2)} REMAINING`,
  )

  const updated = await prisma.giftCard.findUnique({ where: { id: card.id } })
  return NextResponse.json(updated)
}
