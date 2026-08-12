import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId = req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const periods = await prisma.payPeriod.findMany({
    where: { venueId, deletedAt: null },
    include: { _count: { select: { entries: true } } },
    orderBy: { startDate: 'desc' },
  })

  const result = periods.map((p) => ({
    id: p.id,
    venueId: p.venueId,
    startDate: p.startDate.toISOString().slice(0, 10),
    endDate: p.endDate.toISOString().slice(0, 10),
    status: p.status,
    paidAt: p.paidAt,
    entryCount: p._count.entries,
  }))

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { venueId, startDate, endDate, frequency } = body

  if (!venueId) return NextResponse.json({ error: 'VENUE IS REQUIRED' }, { status: 400 })
  if (!startDate || !endDate) return NextResponse.json({ error: 'START AND END DATES ARE REQUIRED' }, { status: 400 })

  // Overlapping OPEN periods would double-pay on close — refuse.
  const overlap = await prisma.payPeriod.findFirst({
    where: {
      venueId,
      deletedAt: null,
      startDate: { lte: new Date(endDate) },
      endDate: { gte: new Date(startDate) },
    },
  })
  if (overlap) return NextResponse.json({ error: 'PERIOD OVERLAPS AN EXISTING PERIOD' }, { status: 409 })

  const period = await prisma.payPeriod.create({
    data: {
      venueId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  })

  if (frequency && ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY'].includes(frequency)) {
    await prisma.payrollSettings.upsert({
      where: { venueId },
      update: { payFrequency: frequency as 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' },
      create: { venueId, payFrequency: frequency as 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' },
    })
  }

  return NextResponse.json(period, { status: 201 })
}
