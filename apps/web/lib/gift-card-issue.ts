import { prisma } from '@hospo-ops/db'
import { generateGiftCardPdf, giftCardPdfToBuffer } from '@/lib/gift-card-pdf'
import { fillGiftCardTemplate, mergePdfBuffers, GiftCardFieldMapping } from '@/lib/gift-card-template'
import { formatDate } from '@/lib/utils'
import { readFileSync, existsSync } from 'fs'
import fs from 'fs'
import path from 'path'

// ── Shared gift card PDF generation ───────────────────────────────────
// One implementation for every issuer: the admin issue route, the bulk
// print route, the WooCommerce order auto-issue, and the public endpoint
// the plugin fetches from. Active venue template when present (filled via
// its field mapping), jsPDF built-in otherwise.
// ──────────────────────────────────────────────────────────────────────

export interface GiftCardPdfSource {
  venueId: string
  number: string
  amount: number
  customerName?: string | null
  message?: string | null
  issuedAt?: Date | null
  createdAt?: Date | null
}

/** Build the PDF bytes for one card using the venue's active template. */
export async function giftCardPdfBuffer(card: GiftCardPdfSource): Promise<Buffer> {
  const template = await prisma.giftCardTemplate.findFirst({
    where: { venueId: card.venueId, isActive: true, deletedAt: null },
  })

  const values = {
    number: card.number,
    amount: card.amount,
    customerName: card.customerName || '',
    issueDate: formatDate(card.issuedAt ?? card.createdAt ?? new Date()),
    message: card.message || undefined,
  }

  if (template && existsSync(template.filePath)) {
    return fillGiftCardTemplate(
      readFileSync(template.filePath),
      (template.fieldMapping as unknown as GiftCardFieldMapping[]) ?? [],
      values,
    )
  }

  return giftCardPdfToBuffer(generateGiftCardPdf(values))
}

/** Build one PDF containing every card (merged). */
export async function mergedGiftCardPdf(cards: GiftCardPdfSource[]): Promise<Buffer> {
  const buffers = await Promise.all(cards.map((c) => giftCardPdfBuffer(c)))
  return mergePdfBuffers(buffers)
}

/** Generate the card's PDF and write it to the uploads dir. Returns the path. */
export async function issueGiftCardPdf(card: GiftCardPdfSource): Promise<string> {
  const pdfDir = path.join(process.cwd(), 'public', 'uploads', 'gift-cards')
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true })

  const pdfPath = path.join(pdfDir, `Gift Card - ${card.number}.pdf`)
  const buffer = await giftCardPdfBuffer(card)
  fs.writeFileSync(pdfPath, buffer)
  return pdfPath
}
