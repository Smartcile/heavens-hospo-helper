import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { resetGiftCardToDraft } from '@/lib/gift-cards'

/**
 * POST /api/admin/gift-cards/:id/reset
 *
 * Return an issued/voided card to a blank DRAFT so it can be sold/issued again
 * with the SAME number: clears amount, customer fields, message, PDF and the
 * linked order; keeps the number and the FULL history (a RESET event is
 * appended — history is never removed). Cards involved in a replacement chain
 * (either side) are retired for good and cannot be reset — their numbers are
 * out of circulation on purpose.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.redeem')
  if (denied) return denied

  const result = await resetGiftCardToDraft(session.user.venueId, params.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result.card)
}
