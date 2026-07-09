import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { bulkCreateDrafts } from '@/lib/gift-cards'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count, amount, year } = await req.json()

  if (!count || count < 1) return NextResponse.json({ error: 'Count must be at least 1' }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount is required' }, { status: 400 })

  const targetYear = year || new Date().getFullYear()
  const numbers = await bulkCreateDrafts(session.user.venueId, targetYear, count, amount)

  return NextResponse.json({ numbers, count: numbers.length }, { status: 201 })
}
