import { prisma } from '../index'

async function main() {
  console.log('')
  console.log('▸ BudgetDayAllocation migration check...')

  const rows: { exists: boolean }[] = await prisma.$queryRawUnsafe(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'BudgetDayAllocation' AND column_name = 'budgetPeriodId'
    ) AS "exists"`
  )
  if (!rows[0]?.exists) {
    console.log('  ✓ Already migrated — nothing to do.')
    return
  }

  console.log('  Old-format columns found — running data migration...')

  // 1. Create BudgetDay table if missing
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BudgetDay" (
      "id" TEXT NOT NULL,
      "budgetPeriodId" TEXT NOT NULL,
      "date" DATE NOT NULL,
      "isWorkingDay" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "BudgetDay_pkey" PRIMARY KEY ("id")
    )
  `)

  // 2. Create BudgetCategory table if missing
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BudgetCategory" (
      "id" TEXT NOT NULL,
      "budgetPeriodId" TEXT NOT NULL,
      "departmentId" TEXT,
      "name" TEXT NOT NULL,
      "percentage" DOUBLE PRECISION NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "deletedAt" TIMESTAMP(3),
      CONSTRAINT "BudgetCategory_pkey" PRIMARY KEY ("id")
    )
  `)

  // 3. Add new columns as nullable if missing
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "BudgetDayAllocation" ADD COLUMN IF NOT EXISTS "budgetDayId" TEXT
  `)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "BudgetDayAllocation" ADD COLUMN IF NOT EXISTS "budgetCategoryId" TEXT
  `)

  // 4. Create BudgetDay rows for distinct (budgetPeriodId, date) from legacy allocs
  await prisma.$executeRawUnsafe(`
    INSERT INTO "BudgetDay" (id, "budgetPeriodId", date, "isWorkingDay", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, a."budgetPeriodId", a.date, true, NOW(), NOW()
    FROM (SELECT DISTINCT "budgetPeriodId", date FROM "BudgetDayAllocation" WHERE "budgetDayId" IS NULL AND "budgetPeriodId" IS NOT NULL) a
    WHERE NOT EXISTS (
      SELECT 1 FROM "BudgetDay" d WHERE d."budgetPeriodId" = a."budgetPeriodId" AND d.date = a.date
    )
  `)

  // 5. Create default REVENUE category per BudgetPeriod that lacks one
  await prisma.$executeRawUnsafe(`
    INSERT INTO "BudgetCategory" (id, "budgetPeriodId", name, percentage, "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, p.id, 'REVENUE', 100, NOW(), NOW()
    FROM "BudgetPeriod" p
    WHERE NOT EXISTS (
      SELECT 1 FROM "BudgetCategory" c WHERE c."budgetPeriodId" = p.id AND c.name = 'REVENUE' AND c."deletedAt" IS NULL
    )
  `)

  // 6. Backfill budgetDayId and budgetCategoryId on old allocations
  const result: { updated: bigint }[] = await prisma.$queryRawUnsafe(`
    WITH updated AS (
      UPDATE "BudgetDayAllocation" a
      SET "budgetDayId" = d.id, "budgetCategoryId" = c.id
      FROM "BudgetDay" d, "BudgetCategory" c
      WHERE a."budgetPeriodId" = d."budgetPeriodId"
        AND a.date = d.date
        AND c."budgetPeriodId" = a."budgetPeriodId"
        AND c.name = 'REVENUE'
        AND c."deletedAt" IS NULL
        AND a."budgetDayId" IS NULL
      RETURNING a.id
    )
    SELECT COUNT(*) AS updated FROM updated
  `)
  const count = Number(result[0]?.updated ?? 0)
  console.log(`  ✓ Backfilled ${count} BudgetDayAllocation row(s).`)

  // Verify no rows left behind
  const remaining: { cnt: bigint }[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) AS cnt FROM "BudgetDayAllocation" WHERE "budgetDayId" IS NULL AND "budgetPeriodId" IS NOT NULL
  `)
  const left = Number(remaining[0]?.cnt ?? 0)
  if (left > 0) {
    console.error(`  ⚠ ${left} row(s) still have null budgetDayId — something went wrong.`)
    process.exit(1)
  }

  console.log('  ✓ Data migration complete.')
}

main()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
