import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getNextNumber } from '@/lib/gift-cards'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const url = new URL(req.url)
  const yearStr = url.searchParams.get('year')
  const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear()

  const nextNumber = await getNextNumber(session.user.venueId, year)

  return NextResponse.json({ number: nextNumber, year })
}
