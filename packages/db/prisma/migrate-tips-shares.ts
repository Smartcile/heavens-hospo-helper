/**
 * Backfill TipsShare rows from the legacy `TipsPeriod.shares` JSON snapshot.
 *
 * The JSON column is kept (mapped as `legacyShares`) so this can run once per
 * deployment. A period that already has ANY TipsShare row (live or soft-
 * deleted) is skipped, which makes the script idempotent and makes a re-run
 * after the app has written rows a no-op.
 *
 * Legacy names are matched to venue staff only when the full name is
 * unambiguous; otherwise the person is created as a manual (staffId: null) row.
 *
 * Must run AFTER `prisma db push` (the TipsShare table + enum are created by it).
 *
 *   npm run db:migrate-tips-shares
 */

import { prisma } from '../index'
import { TipsShareStatus } from '@prisma/client'

interface LegacyShare {
  name?: unknown
  hours?: unknown
  shareWeight?: unknown
}

interface StaffName {
  id: string
  firstName: string
  lastName: string
}

function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

function matchStaff(name: string, staff: readonly StaffName[]): string | null {
  const target = normaliseName(name)
  if (!target) return null
  const matches = staff.filter(
    (s) => normaliseName(`${s.firstName} ${s.lastName}`) === target,
  )
  return matches.length === 1 ? matches[0].id : null
}

async function main() {
  const periods = await prisma.tipsPeriod.findMany({
    where: { deletedAt: null },
    orderBy: [{ fromDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, venueId: true, legacyShares: true },
  })

  const staffByVenue = new Map<string, StaffName[]>()
  for (const venueId of new Set(periods.map((p) => p.venueId))) {
    const staff = await prisma.staff.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    })
    staffByVenue.set(venueId, staff)
  }

  let created = 0
  let skippedPeriods = 0

  for (const period of periods) {
    const existing = await prisma.tipsShare.count({ where: { tipsPeriodId: period.id } })
    if (existing > 0) {
      skippedPeriods++
      continue
    }

    const legacy = Array.isArray(period.legacyShares) ? period.legacyShares : []
    if (legacy.length === 0) continue

    const staff = staffByVenue.get(period.venueId) ?? []
    const usedStaff = new Set<string>()
    const rows: {
      tipsPeriodId: string
      staffId: string | null
      name: string
      hours: number
      shareWeight: number
      sortOrder: number
      status: TipsShareStatus
    }[] = []

    legacy.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') return
      const raw = entry as LegacyShare
      const name = typeof raw.name === 'string' ? normaliseName(raw.name) : ''
      if (!name) return
      let staffId = matchStaff(name, staff)
      // The same person listed twice must not break the unique key. Keep the
      // link on the first row only.
      if (staffId && usedStaff.has(staffId)) staffId = null
      if (staffId) usedStaff.add(staffId)

      const hours = Number(raw.hours)
      const weight = Number(raw.shareWeight)
      rows.push({
        tipsPeriodId: period.id,
        staffId,
        name,
        hours: Number.isFinite(hours) && hours > 0 ? hours : 0,
        shareWeight: Number.isFinite(weight) && weight > 0 ? weight : 0,
        sortOrder: index,
        status: TipsShareStatus.PLANNED,
      })
    })

    if (rows.length === 0) continue
    await prisma.tipsShare.createMany({ data: rows })
    created += rows.length
  }

  console.log(
    `[tips-shares] created ${created} share row(s); skipped ${skippedPeriods} period(s) that already had rows`,
  )
}

main()
  .catch((e) => {
    console.error('[tips-shares] migration failed', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
