import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayIssueGiftCards } from '@/lib/worker-gift-access'
import { prisma } from '@hospo-ops/db'
import fs from 'fs'

/** GET /api/worker/giftcards/[id]/pdf — the issued card's PDF for printing. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!(await workerMayIssueGiftCards(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session!.venueId, deletedAt: null },
    select: { number: true, pdfPath: true },
  })
  if (!card || !card.pdfPath || !fs.existsSync(card.pdfPath)) {
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
