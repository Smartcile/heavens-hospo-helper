import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('')
  console.log('▸ Budget allocation migration check...')

  const row: { exists: boolean }[] = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'BudgetDayAllocation' AND column_name = 'budgetPeriodId'
    ) AS "exists"`
  )
  if (!row[0]?.exists) {
    console.log('  ✓ Schema already final (Phase 3) — nothing to migrate.')
    return
  }

  const oldAllocs: { id: string; budgetPeriodId: string; date: Date }[] =
    await prisma.$queryRawUnsafe(
      `SELECT id, "budgetPeriodId", date FROM "BudgetDayAllocation"
       WHERE "budgetDayId" IS NULL AND "budgetPeriodId" IS NOT NULL`
    )

  if (oldAllocs.length === 0) {
    console.log('  ✓ No legacy allocations to migrate.')
    return
  }

  console.log(`  Found ${oldAllocs.length} legacy allocation(s) to migrate.`)

  const periodMap = new Map<string, typeof oldAllocs>()
  for (const a of oldAllocs) {
    if (!periodMap.has(a.budgetPeriodId)) periodMap.set(a.budgetPeriodId, [])
    periodMap.get(a.budgetPeriodId)!.push(a)
  }

  for (const [periodId, allocs] of periodMap) {
    let revenueCat = await prisma.budgetCategory.findFirst({
      where: { budgetPeriodId: periodId, deletedAt: null },
    })
    if (!revenueCat) {
      revenueCat = await prisma.budgetCategory.create({
        data: { budgetPeriodId: periodId, name: 'REVENUE', percentage: 100 },
      })
    }

    const dateSet = [...new Set(allocs.map((a) => a.date.toISOString()))]
    const dayMap = new Map<string, string>()
    for (const dateStr of dateSet) {
      const date = new Date(dateStr)
      let day = await prisma.budgetDay.findFirst({
        where: { budgetPeriodId: periodId, date },
      })
      if (!day) {
        day = await prisma.budgetDay.create({
          data: { budgetPeriodId: periodId, date, isWorkingDay: true },
        })
      }
      dayMap.set(dateStr, day.id)
    }

    for (const a of allocs) {
      const dayId = dayMap.get(a.date.toISOString())
      if (!dayId) continue
      await prisma.budgetDayAllocation.update({
        where: { id: a.id },
        data: { budgetDayId: dayId, budgetCategoryId: revenueCat.id },
      })
    }
    console.log(`    Migrated ${allocs.length} allocation(s) in period ${periodId}`)
  }

  console.log('  ✓ Budget allocation migration complete.')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
