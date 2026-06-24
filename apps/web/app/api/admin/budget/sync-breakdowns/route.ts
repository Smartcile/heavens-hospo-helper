import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { venueId, sourceCategories } = (await req.json()) as {
    venueId: string
    sourceCategories: { name: string; departmentId: string | null; percentage: number }[]
  }

  if (!venueId) return NextResponse.json({ error: 'venueId required' }, { status: 400 })
  if (session.user.role === 'MANAGER' && venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const periods = await prisma.budgetPeriod.findMany({
    where: { venueId, deletedAt: null },
    include: { categories: { where: { deletedAt: null } } },
  })

  let synced = 0

  for (const period of periods) {
    const sourceNames = sourceCategories
      .map((c) => c.name.toUpperCase().trim())
      .filter(Boolean)

    // Soft-delete categories in this period not in the source (excluding REVENUE)
    await prisma.budgetCategory.updateMany({
      where: {
        budgetPeriodId: period.id,
        deletedAt: null,
        name: { notIn: ['REVENUE', ...sourceNames] },
      },
      data: { deletedAt: new Date() },
    })

    // Upsert each source category into this period
    for (const cat of sourceCategories) {
      const name = cat.name.toUpperCase().trim()
      if (!name) continue

      const existing = period.categories.find(
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
            budgetPeriodId: period.id,
            name,
            percentage: Number(cat.percentage) || 0,
            departmentId: cat.departmentId || null,
          },
        })
      }
    }

    synced++
  }

  return NextResponse.json({ syncedPeriods: synced })
}
