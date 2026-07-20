import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exec } from 'child_process'
import { writeFile, unlink } from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'

async function runCommand(cmd: string, timeout = 120_000): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    exec(cmd, { timeout, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ stdout, stderr, code: error?.code ? (typeof error.code === 'number' ? error.code : 1) : 0 })
    })
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not configured' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const content = await file.text()
  const fileName = file.name

  try {
    const isSql = fileName.endsWith('.sql') || content.trimStart().startsWith('--') || content.includes('CREATE TABLE')

    if (isSql) {
      // SQL dump — restore via psql
      const tmpFile = path.join(process.cwd(), '..', `${randomUUID()}.sql`)
      await writeFile(tmpFile, content, 'utf-8')
      const escaped = dbUrl.replace(/"/g, '\\"')

      // Drop existing schema first, then restore
      const { code: dropCode, stderr: dropErr } = await runCommand(
        `psql --dbname="${escaped}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`,
        30_000
      )
      if (dropCode !== 0) {
        await unlink(tmpFile).catch(() => {})
        return NextResponse.json({ error: `Failed to clean database: ${dropErr}` }, { status: 500 })
      }

      const { code } = await runCommand(`psql --dbname="${escaped}" -f "${tmpFile}"`, 120_000)
      await unlink(tmpFile).catch(() => {})

      if (code === 0) {
        return NextResponse.json({ success: true, type: 'sql' })
      }
      return NextResponse.json({ error: 'Restore failed. Check that the backup file is a valid pg_dump output.' }, { status: 500 })
    }

    // JSON backup — restore via Prisma upserts
    const { prisma } = await import('@hospo-ops/db')
    const backup = JSON.parse(content)
    if (!backup.data || typeof backup.data !== 'object') {
      return NextResponse.json({ error: 'Invalid backup file format' }, { status: 400 })
    }

    const models = Object.keys(backup.data)
    // Order matters: create parent tables first (no FK dependencies), then children
    const orderedModels = [
      'Venue', 'Department', 'Section', 'Staff', 'StaffVenue', 'StaffSection',
      'DepartmentLink',
      'Task', 'TaskRequiredTraining', 'TrainingModule', 'TrainingStep', 'TrainingAssignment', 'TrainingCompletion',
      'StepTask', 'StepModule', 'StepInventoryItem', 'ModuleDepartment', 'ModuleTask',
      'ResourceSection', 'ResourceLink',
      'Checklist', 'ChecklistTask',
      'Notice',
      'InventoryCategory', 'UnitOfMeasure', 'Supplier', 'SupplierItemCode', 'InventoryItem', 'ElementInventoryItem',
      'TableProfile', 'TableProfileItem', 'TableGroup',
      'FloorPlan', 'FloorPlanElement', 'FloorPlanSetup', 'SetupItem',
      'SectionBoundary',
      'Recipe', 'RecipeLineItem', 'MenuItem', 'MenuItemVenue',
      'WooIntegration', 'SyncLog', 'WooOrder', 'WooOrderItem',
      'CalendarEvent',
      'Booking', 'BookingTable',
      'BudgetPeriod', 'BudgetCategory', 'BudgetDay', 'BudgetDayAllocation',
      'StocktakeRecord', 'StocktakeLineItem',
      'Shift', 'ShiftNote', 'TimeOffRequest',
      'StaffNotice',
      'PaletteDefault',
      'QRCode',
      'FollowUp',
      'TrainingModuleLink',
      'GiftCard',
      'TimeClock', 'PayPeriod',
      ...models.filter((m) => !orderedModels.includes(m)),
    ].filter((m) => models.includes(m))

    for (const model of orderedModels) {
      const rows = backup.data[model]
      if (!Array.isArray(rows) || rows.length === 0) continue
      try {
        await prisma.$transaction(async (tx: any) => {
          for (const row of rows) {
            const { id, createdAt, updatedAt, deletedAt, ...fields } = row
            if (!id) continue
            const data: any = {}
            for (const [key, val] of Object.entries(fields)) {
              // Handle Prisma model naming (camelCase)
              data[key] = val
            }
            // Use raw SQL upsert for each row to avoid Prisma model binding issues
            const columns = Object.keys(data)
            const values = columns.map((c) => {
              const v = data[c]
              if (v === null) return 'NULL'
              if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
              if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
              if (typeof v === 'number') return String(v)
              if (v instanceof Date || (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/))) return `'${v}'`
              if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
              return 'NULL'
            })
            const idVal = `'${id}'`
            const conflictColumn = model === 'Venue' ? 'id' : 'id'
            const conflictClause = model === 'Venue'
              ? `ON CONFLICT (id) DO UPDATE SET ${columns.map((c, i) => `"${c}" = ${values[i]}`).join(', ')}`
              : `ON CONFLICT (id) DO NOTHING`
            await tx.$executeRawUnsafe(
              `INSERT INTO "${model}" ("id", ${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${idVal}, ${values.join(', ')}) ${conflictClause}`
            )
          }
        })
      } catch { /* skip if model doesn't exist in current schema */ }
    }

    return NextResponse.json({ success: true, type: 'json', models: orderedModels.length })
  } catch (err: any) {
    return NextResponse.json({ error: `Restore failed: ${err.message}` }, { status: 500 })
  }
}
