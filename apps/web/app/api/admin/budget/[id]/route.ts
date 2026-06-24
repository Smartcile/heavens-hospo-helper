import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

interface IncomingCategory {
  id?: string
  name: string
  departmentId?: string | null
  percentage: number
}

interface IncomingDay {
  id: string
  isWorkingDay: boolean
}

interface IncomingAllocation {
  budgetDayId: string
  budgetCategoryId: string
  amount: number
  note?: string | null
}

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

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = await prisma.budgetPeriod.findFirst({
    where: { id: params.id, deletedAt: null },
  })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && period.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { totalBudget, dailyWeights, categories, days, allocations } = body as {
    totalBudget?: number
    dailyWeights?: Record<string, number>
    categories?: IncomingCategory[]
    days?: IncomingDay[]
    allocations?: IncomingAllocation[]
  }

  const sanitized = categories?.map((c) => ({
    ...c,
    departmentId: !c.departmentId || c.departmentId === '__venue__' ? null : c.departmentId,
  }))

  await prisma.$transaction(async (tx) => {
    await tx.budgetPeriod.update({
      where: { id: params.id },
      data: {
        ...(totalBudget !== undefined ? { totalBudget: Number(totalBudget) || 0 } : {}),
        ...(dailyWeights !== undefined ? { dailyWeights } : {}),
      },
    })

    if (sanitized) {
      const incomingIds = sanitized.filter((c) => c.id).map((c) => c.id!)
      if (incomingIds.length > 0) {
        await tx.budgetCategory.updateMany({
          where: { budgetPeriodId: params.id, deletedAt: null, id: { notIn: incomingIds } },
          data: { deletedAt: new Date() },
        })
      } else {
        await tx.budgetCategory.updateMany({
          where: { budgetPeriodId: params.id, deletedAt: null },
          data: { deletedAt: new Date() },
        })
      }

      for (const cat of sanitized) {
        if (!cat.id) continue
        await tx.budgetCategory.upsert({
          where: { id: cat.id },
          update: {
            name: cat.name.toUpperCase().trim(),
            departmentId: cat.departmentId || null,
            percentage: Number(cat.percentage) || 0,
            deletedAt: null,
          },
          create: {
            id: cat.id,
            budgetPeriodId: params.id,
            name: cat.name.toUpperCase().trim(),
            departmentId: cat.departmentId || null,
            percentage: Number(cat.percentage) || 0,
          },
        })
      }
    }

    if (days) {
      for (const d of days) {
        await tx.budgetDay.update({
          where: { id: d.id },
          data: { isWorkingDay: !!d.isWorkingDay },
        })
      }
    }

    if (allocations) {
      for (const a of allocations) {
        await tx.budgetDayAllocation.upsert({
          where: { budgetDayId_budgetCategoryId: { budgetDayId: a.budgetDayId, budgetCategoryId: a.budgetCategoryId } },
          update: { amount: Number(a.amount) || 0, note: a.note?.trim() || null },
          create: {
            budgetDayId: a.budgetDayId,
            budgetCategoryId: a.budgetCategoryId,
            amount: Number(a.amount) || 0,
            note: a.note?.trim() || null,
          },
        })
      }
    }
  })

  const full = await prisma.budgetPeriod.findFirst({
    where: { id: params.id, deletedAt: null },
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

  return NextResponse.json({ period: full ? flattenAllocations(full) : null })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = await prisma.budgetPeriod.findFirst({
    where: { id: params.id, deletedAt: null },
  })
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && period.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.budgetPeriod.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ success: true })
}
