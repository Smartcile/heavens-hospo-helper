import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { replaceGiftCard } from '@/lib/gift-cards'
import { guardAccess } from '@/lib/permissions'

/**
 * POST /api/admin/gift-cards/:id/replace
 *
 * Void an issued card and issue a replacement with corrected details
 * (`amount`, `customerName`, `customerEmail`, `message` — each optional and
 * falling back to the old card's value — plus a required `reason`). The
 * replacement keeps the old card's WooCommerce order link, so the store's
 * PDF flow (public endpoint + email attachments) serves the new card.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason : ''
  if (!reason.trim()) return NextResponse.json({ error: 'A reason is required' }, { status: 400 })

  try {
    const result = await replaceGiftCard(params.id, {
      amount: body.amount != null ? Number(body.amount) : undefined,
      customerName: body.customerName ?? undefined,
      customerEmail: body.customerEmail ?? undefined,
      message: body.message ?? undefined,
      reason,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'REPLACE FAILED' }, { status: 400 })
  }
}
