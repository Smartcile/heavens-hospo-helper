import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { monthDays } from '@/lib/calendar'

function flattenAllocations(period: {
  categories: { id: string; name: string; allocations: { budgetDayId: string; amount: number; note: string | null; day: { date: Date } }[] }[]
}) {
  const allocations: { budgetDayId: string; budgetCategoryId: string; amount: number; note: string | null; day: { date: Date }; category: { id: string; name: string } }[] = []
  for (const cat of period.categories) {
    for (const a of cat.allocations) {
      allocations.push({
        budgetDayId: a.budgetDayId,
        budgetCategoryId: cat.id,
        amount: a.amount,
        note: a.note,
        day: a.day,
        category: { id: cat.id, name: cat.name },
      })
    }
  }
  allocations.sort((a, b) => {
    const da = new Date(a.day.date).getTime()
    const db = new Date(b.day.date).getTime()
    if (da !== db) return da - db
    return a.category.name.localeCompare(b.category.name)
  })
  return { ...period, allocations }
}

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

  const period = await prisma.budgetPeriod.findFirst({
    where: { venueId: venueScope, year, month, deletedAt: null },
    include: {
      categories: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          allocations: {
            include: { day: { select: { date: true } } },
          },
        },
      },
      days: { orderBy: { date: 'asc' } },
    },
  })

  if (!period) {
    const prev = await prisma.budgetPeriod.findFirst({
      where: {
        venueId: venueScope,
        deletedAt: null,
        categories: { some: { deletedAt: null, name: { not: 'REVENUE' } } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { categories: { where: { deletedAt: null, name: { not: 'REVENUE' } } } },
    })
    return NextResponse.json({
      period: null,
      defaults: prev ? {
        categories: prev.categories.map((c) => ({
          id: c.id, name: c.name, departmentId: c.departmentId, percentage: c.percentage,
        })),
      } : null,
    })
  }

  return NextResponse.json({ period: flattenAllocations(period) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { venueId, year, month, totalBudget } = body as {
    venueId?: string
    year: number
    month: number
    totalBudget: number
  }
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!venueScope || !year || !month) {
    return NextResponse.json({ error: 'venue, year and month are required' }, { status: 400 })
  }

  const period = await prisma.budgetPeriod.upsert({
    where: { venueId_year_month: { venueId: venueScope, year, month } },
    update: { totalBudget: Number(totalBudget) || 0, deletedAt: null },
    create: {
      venueId: venueScope,
      year,
      month,
      totalBudget: Number(totalBudget) || 0,
    },
  })

  const { days } = monthDays(year, month)
  await prisma.budgetDay.createMany({
    data: days.map((d) => ({ budgetPeriodId: period.id, date: d, isWorkingDay: true })),
    skipDuplicates: true,
  })

  const full = await prisma.budgetPeriod.findFirst({
    where: { id: period.id, deletedAt: null },
    include: {
      categories: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'asc' },
        include: {
          allocations: {
            include: { day: { select: { date: true } } },
          },
        },
      },
      days: { orderBy: { date: 'asc' } },
    },
  })

  return NextResponse.json({ period: full ? flattenAllocations(full) : null }, { status: 201 })
}
