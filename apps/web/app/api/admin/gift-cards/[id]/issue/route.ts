import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { issueGiftCardPdf } from '@/lib/gift-card-issue'
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

  const pdfPath = await issueGiftCardPdf({
    venueId: card.venueId,
    number: card.number,
    amount,
    customerName: customerName || null,
    message: message || null,
  })

  const updated = await prisma.giftCard.update({
    where: { id: params.id },
    data: { pdfPath, status: 'ISSUED', issuedAt: new Date() },
  })

  return NextResponse.json(updated)
}
