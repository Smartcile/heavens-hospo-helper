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
  const { venueId, startDate, endDate } = body

  if (!venueId) return NextResponse.json({ error: 'VENUE IS REQUIRED' }, { status: 400 })
  if (!startDate || !endDate) return NextResponse.json({ error: 'START AND END DATES ARE REQUIRED' }, { status: 400 })

  const period = await prisma.payPeriod.create({
    data: {
      venueId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    },
  })

  return NextResponse.json(period, { status: 201 })
}
