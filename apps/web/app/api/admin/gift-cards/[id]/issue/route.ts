import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { generateGiftCardPdf, giftCardPdfToBuffer } from '@/lib/gift-card-pdf'
import { formatDate } from '@/lib/utils'
import fs from 'fs'
import path from 'path'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const pdfDir = path.join(process.cwd(), 'public', 'uploads', 'gift-cards')
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true })

  const pdfPath = path.join(pdfDir, `Gift Card - ${card.number}.pdf`)

  const doc = generateGiftCardPdf({
    number: card.number,
    amount: card.amount,
    customerName: card.customerName || '',
    issueDate: formatDate(new Date()),
    message: card.message || undefined,
  })

  const buffer = giftCardPdfToBuffer(doc)
  fs.writeFileSync(pdfPath, buffer)

  const updated = await prisma.giftCard.update({
    where: { id: params.id },
    data: { pdfPath, status: 'ISSUED', issuedAt: new Date() },
  })

  return NextResponse.json(updated)
}
