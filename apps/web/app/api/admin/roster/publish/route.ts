import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// Publish (or unpublish) every shift in a date range — the roster's
// PUBLISHED/DRAFT dropdown. Published shifts become visible to workers.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { venueId, start, end, published } = body as { venueId: string; start: string; end: string; published: boolean }

  if (!venueId || !start || !end) {
    return NextResponse.json({ error: 'VENUE, START AND END ARE REQUIRED' }, { status: 400 })
  }

  const startDate = new Date(`${start}T00:00:00Z`)
  const endDate = new Date(`${end}T23:59:59Z`)

  const result = await prisma.shift.updateMany({
    where: { venueId, deletedAt: null, date: { gte: startDate, lte: endDate } },
    data: { status: published ? 'PUBLISHED' : 'DRAFT' },
  })

  return NextResponse.json({ updated: result.count })
}
