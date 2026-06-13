import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { monthDays } from '@/lib/calendar'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const year = Number(searchParams.get('year') ?? now.getUTCFullYear())
  const month = Number(searchParams.get('month') ?? now.getUTCMonth() + 1)
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  if (!venueScope) return NextResponse.json({ period: null })

  const period = await prisma.budgetPeriod.findUnique({
    where: { venueId_year_month: { venueId: venueScope, year, month } },
    include: { allocations: { orderBy: { date: 'asc' } } },
  })

  return NextResponse.json({ period })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { venueId, year, month, totalBudget, label } = body as {
    venueId?: string
    year: number
    month: number
    totalBudget: number
    label?: string
  }
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!venueScope || !year || !month) {
    return NextResponse.json({ error: 'venue, year and month are required' }, { status: 400 })
  }

  const period = await prisma.budgetPeriod.upsert({
    where: { venueId_year_month: { venueId: venueScope, year, month } },
    update: { totalBudget: Number(totalBudget) || 0, label: label?.trim() || null },
    create: {
      venueId: venueScope,
      year,
      month,
      totalBudget: Number(totalBudget) || 0,
      label: label?.trim() || null,
    },
  })

  // Ensure an allocation row exists for every day of the month.
  const { days } = monthDays(year, month)
  await prisma.budgetDayAllocation.createMany({
    data: days.map((d) => ({ budgetPeriodId: period.id, date: d, amount: 0, isWorkingDay: true })),
    skipDuplicates: true,
  })

  const full = await prisma.budgetPeriod.findUnique({
    where: { id: period.id },
    include: { allocations: { orderBy: { date: 'asc' } } },
  })
  return NextResponse.json({ period: full }, { status: 201 })
}
