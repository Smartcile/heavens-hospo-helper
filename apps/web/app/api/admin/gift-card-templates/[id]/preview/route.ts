import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { fillGiftCardTemplate, GiftCardFieldMapping } from '@/lib/gift-card-template'
import { formatDate } from '@/lib/utils'
import { readFileSync, existsSync } from 'fs'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const template = await prisma.giftCardTemplate.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!existsSync(template.filePath)) return NextResponse.json({ error: 'Template PDF not found' }, { status: 404 })

  const buffer = await fillGiftCardTemplate(
    readFileSync(template.filePath),
    (template.fieldMapping as unknown as GiftCardFieldMapping[]) ?? [],
    {
      number: '20260001',
      amount: 50,
      customerName: 'SAMPLE CUSTOMER',
      issueDate: formatDate(new Date()),
      message: 'Something special just for you - see you soon!',
    },
  )

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Gift Card - Preview.pdf"',
    },
  })
}
