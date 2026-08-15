import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { generateGiftCardPdf, giftCardPdfToBuffer } from '@/lib/gift-card-pdf'
import { formatDate } from '@/lib/utils'
import fs from 'fs'
import path from 'path'
import { guardAccess } from '@/lib/permissions'

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

  await prisma.giftCard.update({
    where: { id: params.id },
    data: {
      customerName: customerName || null,
      customerEmail: customerEmail || null,
      amount,
      message: message || null,
      isInternal: isInternal ?? false,
    },
  })

  const pdfDir = path.join(process.cwd(), 'public', 'uploads', 'gift-cards')
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true })

  const pdfPath = path.join(pdfDir, `Gift Card - ${card.number}.pdf`)

  const doc = generateGiftCardPdf({
    number: card.number,
    amount,
    customerName: customerName || '',
    issueDate: formatDate(new Date()),
    message: message || undefined,
  })

  const buffer = giftCardPdfToBuffer(doc)
  fs.writeFileSync(pdfPath, buffer)

  const updated = await prisma.giftCard.update({
    where: { id: params.id },
    data: { pdfPath, status: 'ISSUED', issuedAt: new Date() },
  })

  return NextResponse.json(updated)
}
