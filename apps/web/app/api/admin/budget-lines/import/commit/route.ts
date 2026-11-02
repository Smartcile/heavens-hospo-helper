import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { assignParentIndexes, monthYearForName } from '@/lib/budget-lines-import'
import type { PnlImportRow } from '@/lib/budget-lines-import'
import { guardAccess } from '@/lib/permissions'

const LINE_KINDS = ['GROUP', 'LINE', 'TOTAL'] as const

interface IncomingRow {
  label: string
  kind: string
  depth: number
  values: (number | null)[]
  sectionId: string | null
  include: boolean
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.budget.edit')
  if (denied) return denied

  const body = await req.json()
  const { venueId, year, months, rows } = body as {
    venueId?: string
    year: number
    months: string[]
    rows: IncomingRow[]
  }

  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!venueScope || !year || !Array.isArray(months) || months.length === 0 || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'venueId, year, months and rows are required' }, { status: 400 })
  }

  const included = rows
    .filter((r) => r.include && r.kind !== 'SKIP' && r.label?.trim())
    .map((r) => ({
      label: r.label,
      kind: LINE_KINDS.includes(r.kind as (typeof LINE_KINDS)[number])
        ? (r.kind as PnlImportRow['kind'])
        : 'LINE',
      depth: Number(r.depth) || 0,
      values: Array.isArray(r.values) ? r.values : [],
      sectionId: r.sectionId || null,
      include: true,
    }))

  if (included.length === 0) {
    return NextResponse.json({ error: 'No rows selected for import' }, { status: 400 })
  }

  const parentIndexes = assignParentIndexes(included)

  const sections = await prisma.section.findMany({
    where: { venueId: venueScope, deletedAt: null },
    select: { id: true },
  })
  const validSections = new Set(sections.map((s) => s.id))

  let createdPeriods = 0
  let skippedPeriods = 0
  let totalLines = 0

  await prisma.$transaction(async (tx) => {
    for (let col = 0; col < months.length; col++) {
      const { month, year: periodYear } = monthYearForName(months[col], year)

      const existing = await tx.budgetPeriod.findFirst({
        where: { venueId: venueScope, year: periodYear, month, deletedAt: null },
        select: { id: true },
      })

      if (existing) {
        const lineCount = await tx.budgetLine.count({
          where: { budgetPeriodId: existing.id, deletedAt: null },
        })
        if (lineCount > 0) {
          skippedPeriods++ // already imported — never duplicate
          continue
        }
      }

      let periodId: string
      if (existing) {
        periodId = existing.id
      } else {
        const totalRow = included.find((r) => r.kind === 'TOTAL' && r.values[col] != null)
        const period = await tx.budgetPeriod.create({
          data: {
            venueId: venueScope,
            year: periodYear,
            month,
            totalBudget: totalRow ? Number(totalRow.values[col]) || 0 : 0,
          },
        })
        periodId = period.id
        createdPeriods++
      }

      const createdIds: (string | null)[] = included.map(() => null)
      for (let i = 0; i < included.length; i++) {
        const row = included[i]
        const parentIndex = parentIndexes[i]
        const line = await tx.budgetLine.create({
          data: {
            budgetPeriodId: periodId,
            parentId: parentIndex !== null ? createdIds[parentIndex] : null,
            sectionId: validSections.has(row.sectionId ?? '') ? row.sectionId : null,
            name: row.label.toUpperCase().trim(),
            kind: row.kind as 'GROUP' | 'LINE' | 'TOTAL',
            amount: row.kind === 'LINE' ? (Number(row.values[col]) || 0) : null,
            sortOrder: i,
          },
        })
        createdIds[i] = line.id
        totalLines++
      }
    }
  })

  return NextResponse.json({ createdPeriods, skippedPeriods, totalLines })
}
