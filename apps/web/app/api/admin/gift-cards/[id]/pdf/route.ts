import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import fs from 'fs'
import { guardAccess } from '@/lib/permissions'

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
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Gift Card - ${card.number}.pdf"`,
    },
  })
}
