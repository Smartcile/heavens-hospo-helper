import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { venueFromApiKey } from '@/lib/public-api'
import { issueGiftCardPdf, giftCardPdfBuffer, mergedGiftCardPdf } from '@/lib/gift-card-issue'
import { existsSync } from 'fs'

/**
 * GET /api/public/orders/:wooOrderId/gift-card-pdf
 *
 * The gift card PDF(s) for a WooCommerce order — fetched by the HOSPO OPS
 * WordPress plugin on `woocommerce_email_attachments` so the store's order
 * emails carry the issued card. Auth: the venue's API key (Bearer).
 *
 * PDFs are generated lazily when missing (covers legacy DRAFT cards), and
 * a successful fetch marks the cards SENT — the plugin download IS the
 * digital delivery. Returns 404 when the order has no gift cards, which the
 * plugin treats as "nothing to attach" (the email still sends).
 */
export async function GET(req: NextRequest, { params }: { params: { wooOrderId: string } }) {
  const venue = await venueFromApiKey(req)
  if (!venue) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cards = await prisma.giftCard.findMany({
    where: {
      venueId: venue.id,
      wooOrderId: params.wooOrderId,
      deletedAt: null,
      status: { not: 'VOIDED' },
    },
    orderBy: { number: 'asc' },
  })
  if (cards.length === 0) {
    return NextResponse.json({ error: 'No gift cards on this order' }, { status: 404 })
  }

  const now = new Date()
  for (const card of cards) {
    let pdfPath = card.pdfPath
    if (!pdfPath || !existsSync(pdfPath)) {
      pdfPath = await issueGiftCardPdf(card)
      await prisma.giftCard.update({
        where: { id: card.id },
        data: { pdfPath, status: 'ISSUED', issuedAt: card.issuedAt ?? now },
      })
    }
  }

  // The fetch is the delivery — the store emailed the PDF to the customer.
  await prisma.giftCard.updateMany({
    where: { id: { in: cards.map((c) => c.id) }, status: { not: 'SENT' }, deletedAt: null },
    data: { status: 'SENT', sentAt: now },
  })

  const buffer = cards.length === 1 ? await giftCardPdfBuffer(cards[0]) : await mergedGiftCardPdf(cards)
  const filename = cards.length === 1
    ? `Gift Card - ${cards[0].number}.pdf`
    : `Gift Cards - ${cards.length} cards.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
