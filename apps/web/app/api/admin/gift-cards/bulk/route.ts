import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { premadeCards } from '@/lib/gift-cards'
import { guardAccess } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.redeem')
  if (denied) return denied

  const { count } = await req.json()

  if (!count || count < 1) return NextResponse.json({ error: 'Count must be at least 1' }, { status: 400 })

  try {
    const numbers = await premadeCards(session.user.venueId, count, 0)
    return NextResponse.json({ numbers, count: numbers.length }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
