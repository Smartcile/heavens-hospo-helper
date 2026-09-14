import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { nextDraft } from '@/lib/gift-cards'
import { guardAccess } from '@/lib/permissions'

/** GET — the next premade card (lowest-numbered DRAFT, any year) or null. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const draft = await nextDraft(session.user.venueId)

  return NextResponse.json({ draft })
}
