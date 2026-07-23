import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { monthDays } from '@/lib/calendar'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { venueId, year, targetMonths, sourceCategories } = (await req.json()) as {
    venueId: string
    year?: number
    targetMonths?: number[]
    sourceCategories: { name: string; departmentId: string | null; percentage: number }[]
  }

  if (!venueId) return NextResponse.json({ error: 'venueId required' }, { status: 400 })
  if (session.user.role === 'MANAGER' && venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const where: any = { venueId, deletedAt: null }
  if (year && targetMonths?.length) {
    where.year = year
    where.month = { in: targetMonths }
  }

  const existingPeriods = await prisma.budgetPeriod.findMany({
    where,
    include: { categories: { where: { deletedAt: null } } },
  })

  const sourceNames = sourceCategories
    .map((c) => c.name.toUpperCase().trim())
    .filter(Boolean)

  let synced = 0
  let created = 0

  for (const period of existingPeriods) {
    await syncCategoriesForPeriod(period.id, period.categories, sourceNames, sourceCategories)
    synced++
  }

  if (year && targetMonths?.length) {
    const existingMonths = new Set(existingPeriods.map((p) => p.month))
    const missingMonths = targetMonths.filter((m) => !existingMonths.has(m))
    for (const m of missingMonths) {
      const { days } = monthDays(year, m)
      const period = await prisma.budgetPeriod.create({
        data: {
          venueId,
          year,
          month: m,
          totalBudget: 0,
          days: { create: days.map((d) => ({ date: d, isWorkingDay: true })) },
        },
      })
      await syncCategoriesForPeriod(period.id, [], sourceNames, sourceCategories)
      created++
    }
  }

  return NextResponse.json({ syncedPeriods: synced + created, created })
}

async function syncCategoriesForPeriod(
  periodId: string,
  existingCategories: { id: string; name: string }[],
  sourceNames: string[],
  sourceCategories: { name: string; departmentId: string | null; percentage: number }[],
) {
  await prisma.budgetCategory.updateMany({
    where: {
      budgetPeriodId: periodId,
      deletedAt: null,
      name: { notIn: ['REVENUE', ...sourceNames] },
    },
    data: { deletedAt: new Date() },
  })

  for (const cat of sourceCategories) {
    const name = cat.name.toUpperCase().trim()
    if (!name) continue

    const existing = existingCategories.find(
      (c) => c.name === name && c.name !== 'REVENUE'
    )

    if (existing) {
      await prisma.budgetCategory.update({
        where: { id: existing.id },
        data: {
          percentage: Number(cat.percentage) || 0,
          departmentId: cat.departmentId || null,
          deletedAt: null,
        },
      })
    } else {
      await prisma.budgetCategory.create({
        data: {
          budgetPeriodId: periodId,
          name,
          percentage: Number(cat.percentage) || 0,
          departmentId: cat.departmentId || null,
        },
      })
    }
  }
}
