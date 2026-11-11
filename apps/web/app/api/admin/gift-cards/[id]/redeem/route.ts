import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { redeemGiftCard } from '@/lib/gift-card-redemption.server'

/**
 * POST /api/admin/gift-cards/[id]/redeem — redeem part or all of a card's
 * remaining balance from the admin gift-card page. Same server rules as the
 * worker route.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.redeem')
  if (denied) return denied

  const body = await req.json().catch(() => null)
  const actor = session.user.name || session.user.email || session.user.id
  const result = await redeemGiftCard(session.user.venueId, params.id, body?.amount, { actor })
  return NextResponse.json(result.body, { status: result.status })
}
