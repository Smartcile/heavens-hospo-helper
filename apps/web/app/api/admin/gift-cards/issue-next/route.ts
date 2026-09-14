import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { issuePremade } from '@/lib/gift-cards'
import { logGiftCardEvent } from '@/lib/gift-card-history'
import { guardAccess } from '@/lib/permissions'

/**
 * POST /api/admin/gift-cards/issue-next
 *
 * Issue the NEXT premade card without picking one from the list — takes the
 * lowest-numbered DRAFT and premakes one in the current year's series when
 * none remain (numbers are only ever created by the premake step, never at
 * issue time).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount is required' }, { status: 400 })

  try {
    const card = await issuePremade(session.user.venueId, {
      amount,
      customerName: body.customerName ?? null,
      customerEmail: body.customerEmail ?? null,
      message: body.message ?? null,
      isInternal: !!body.isInternal,
    })
    await logGiftCardEvent(card.id, 'ISSUED', `AMOUNT $${amount.toFixed(2)} — PDF GENERATED`)
    return NextResponse.json(card, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
