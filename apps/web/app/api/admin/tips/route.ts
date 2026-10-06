import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { cleanCashCounts, cleanShares } from '@/lib/tips'

/** "YYYY-MM-DD" (or a full ISO string) → a UTC-midnight Date for a @db.Date column. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.view')
  if (denied) return denied

  const venueId = getManagerVenueId(session, req) ?? new URL(req.url).searchParams.get('venueId')

  const periods = await prisma.tipsPeriod.findMany({
    where: { deletedAt: null, ...(venueId ? { venueId } : {}) },
    orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(periods)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.create')
  if (denied) return denied

  const body = await req.json()
  const fromDate = parseDate(body.fromDate)
  const toDate = parseDate(body.toDate)
  if (!fromDate || !toDate) {
    return NextResponse.json({ error: 'fromDate and toDate are required' }, { status: 400 })
  }

  const venueId = getManagerVenueId(session, req) ?? body.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const cashCounts = cleanCashCounts(body.cashCounts)
  const shares = cleanShares(body.shares)

  const period = await prisma.tipsPeriod.create({
    data: {
      venueId,
      label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().toUpperCase() : null,
      fromDate,
      toDate,
      cashCounts: cashCounts as unknown as Prisma.InputJsonValue,
      posTotal: Number(body.posTotal) || 0,
      shares: shares as unknown as Prisma.InputJsonValue,
      notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    },
  })

  return NextResponse.json(period, { status: 201 })
}
