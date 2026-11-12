// Shared writer for template/copy week operations. Applies an ADD or REPLACE
// over a Monday–Sunday week, creating DRAFT shifts. REPLACE soft-deletes the
// target week's shifts and releases any open-shift seats they held.

import { prisma } from '@hospo-ops/db'
import { releaseSeatForShift } from '@/lib/open-shifts.server'
import { shiftDay } from '@/lib/date-nav'
import type { RosterApplyMode } from '@/lib/roster-template'

export interface DraftShiftData {
  staffId: string
  venueId: string
  departmentId: string | null
  positionId: string | null
  date: Date
  startTime: string
  endTime: string
  breakMinutes: number
  colour: string | null
  tag: string | null
  note: string | null
  status: 'DRAFT'
  createdById: string | null
}

export interface WriteWeekResult {
  created: number
  replaced: number
}

export async function writeShiftWeek(
  venueId: string,
  targetWeekStart: string,
  mode: RosterApplyMode,
  rows: DraftShiftData[],
): Promise<WriteWeekResult> {
  const start = new Date(`${targetWeekStart}T00:00:00Z`)
  const end = new Date(`${shiftDay(targetWeekStart, 6)}T23:59:59Z`)

  return prisma.$transaction(async (tx) => {
    let replaced = 0
    if (mode === 'REPLACE') {
      const existing = await tx.shift.findMany({
        where: { venueId, deletedAt: null, date: { gte: start, lte: end } },
        select: { id: true },
      })
      for (const s of existing) {
        await tx.shift.update({ where: { id: s.id }, data: { deletedAt: new Date() } })
        await releaseSeatForShift(s.id, tx)
      }
      replaced = existing.length
    }

    if (rows.length > 0) {
      await tx.shift.createMany({ data: rows })
    }

    return { created: rows.length, replaced }
  })
}
