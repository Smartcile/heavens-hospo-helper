import { prisma } from '@hospo-ops/db'
import { formatDateKey } from '@/lib/scheduling'
import {
  payrunForStaff,
  type PayrunSession,
  type PayrunSettings,
} from '@/lib/nz-payroll'

export interface StaffHourSummary {
  staffId: string
  totalMinutes: number
  totalHours: number
  sessions: { id: string; clockIn: Date; clockOut: Date }[]
}

export async function calculateStaffHours(
  staffId: string,
  venueId: string,
  startDate: Date,
  endDate: Date,
  excludeNonGeoValid: boolean = false
): Promise<StaffHourSummary> {
  const where: Record<string, unknown> = {
    staffId,
    venueId,
    clockIn: { gte: startDate },
    isActive: false,
    clockOut: { not: null, lte: endDate },
    deletedAt: null,
  }
  if (excludeNonGeoValid) {
    where.geoValid = true
  }

  const sessions = await prisma.timeClock.findMany({
    where,
    select: { id: true, clockIn: true, clockOut: true },
    orderBy: { clockIn: 'asc' },
  })

  let totalMinutes = 0
  for (const s of sessions) {
    if (!s.clockOut) continue
    const diff = s.clockOut.getTime() - s.clockIn.getTime()
    totalMinutes += diff / 60000
  }

  return {
    staffId,
    totalMinutes,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    sessions: sessions as { id: string; clockIn: Date; clockOut: Date }[],
  }
}

const FREQ_PERIODS_PER_YEAR: Record<string, number> = { WEEKLY: 52, FORTNIGHTLY: 26, MONTHLY: 12 }

const DEFAULT_SETTINGS: PayrunSettings = {
  minimumWage: 23.5,
  accRate: 1.47,
  kiwiSaverEmployerRate: 3,
  studentLoanRate: 12,
  holidayPayPct: 8,
  defaultTaxCode: 'M',
  overtimeEnabled: false,
  overtimeHoursPerWeek: 40,
  overtimeRate: 1.5,
  periodsPerYear: 52,
}

/**
 * Close (or re-close) a pay period. Runs the NZ engine over APPROVED clock
 * sessions in the range, replaces the period's entries and alternative-day
 * ledger, and marks the period CLOSED. Idempotent — re-closing recalculates.
 */
export async function generatePayPeriod(
  payPeriodId: string,
  venueId: string,
  startDate: Date,
  endDate: Date,
  closedById?: string
): Promise<number> {
  const endInclusive = new Date(endDate)
  endInclusive.setHours(23, 59, 59, 999)

  const [settingsRow, holidays, sessions, staffRows] = await Promise.all([
    prisma.payrollSettings.findUnique({ where: { venueId } }),
    prisma.publicHoliday.findMany({
      where: { deletedAt: null, date: { gte: startDate, lte: endInclusive }, OR: [{ venueId: null }, { venueId }] },
    }),
    prisma.timeClock.findMany({
      where: {
        venueId,
        isActive: false,
        approvalStatus: 'APPROVED',
        clockOut: { not: null },
        clockIn: { gte: startDate, lte: endInclusive },
        deletedAt: null,
      },
      select: { staffId: true, clockIn: true, clockOut: true, breaksMinutes: true },
    }),
    prisma.staff.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, hourlyRate: true, employmentType: true, taxCode: true, kiwiSaverRate: true, studentLoan: true },
    }),
  ])

  const settings: PayrunSettings = {
    ...DEFAULT_SETTINGS,
    minimumWage: settingsRow?.minimumWage ?? DEFAULT_SETTINGS.minimumWage,
    accRate: settingsRow?.accRate ?? DEFAULT_SETTINGS.accRate,
    kiwiSaverEmployerRate: settingsRow?.kiwiSaverEmployerRate ?? DEFAULT_SETTINGS.kiwiSaverEmployerRate,
    studentLoanRate: settingsRow?.studentLoanRate ?? DEFAULT_SETTINGS.studentLoanRate,
    holidayPayPct: settingsRow?.holidayPayPct ?? DEFAULT_SETTINGS.holidayPayPct,
    defaultTaxCode: settingsRow?.defaultTaxCode ?? DEFAULT_SETTINGS.defaultTaxCode,
    overtimeEnabled: settingsRow?.overtimeEnabled ?? DEFAULT_SETTINGS.overtimeEnabled,
    overtimeHoursPerWeek: settingsRow?.overtimeHoursPerWeek ?? DEFAULT_SETTINGS.overtimeHoursPerWeek,
    overtimeRate: settingsRow?.overtimeRate ?? DEFAULT_SETTINGS.overtimeRate,
    periodsPerYear: FREQ_PERIODS_PER_YEAR[settingsRow?.payFrequency ?? 'WEEKLY'] ?? 52,
  }

  const holidayKeys = new Set(holidays.map((h) => formatDateKey(h.date)))
  const staffById = new Map(staffRows.map((s) => [s.id, s]))

  const sessionsByStaff = new Map<string, PayrunSession[]>()
  for (const s of sessions) {
    const arr = sessionsByStaff.get(s.staffId) ?? []
    arr.push({
      dateKey: formatDateKey(s.clockIn),
      clockIn: s.clockIn.toISOString(),
      clockOut: s.clockOut!.toISOString(),
      breaksMinutes: s.breaksMinutes ?? 0,
    })
    sessionsByStaff.set(s.staffId, arr)
  }

  let created = 0
  await prisma.$transaction(async (tx) => {
    // Re-closing replaces the period's entries AND its alt-day ledger.
    await tx.payrollEntry.deleteMany({ where: { payPeriodId } })
    await tx.alternativeDay.deleteMany({ where: { payPeriodId } })

    for (const [staffId, staffSessions] of sessionsByStaff) {
      const s = staffById.get(staffId)
      if (!s) continue

      const result = payrunForStaff(
        staffSessions,
        {
          hourlyRate: s.hourlyRate,
          employmentType: s.employmentType,
          taxCode: s.taxCode,
          kiwiSaverRate: s.kiwiSaverRate,
          studentLoan: s.studentLoan,
        },
        settings,
        holidayKeys
      )

      const effectiveRate = Math.max(s.hourlyRate ?? 0, settings.minimumWage)
      await tx.payrollEntry.create({
        data: {
          payPeriodId,
          staffId,
          totalHours: result.totalHours,
          hourlyRate: effectiveRate,
          totalPay: result.grossPay,
          ordinaryHours: result.ordinaryHours,
          overtimeHours: result.overtimeHours,
          publicHolidayHours: result.publicHolidayHours,
          grossPay: result.grossPay,
          holidayPay: result.holidayPay,
          annualLeaveAccruedHours: result.annualLeaveAccruedHours,
          alternativeDaysOwed: result.alternativeDaysOwed,
          paye: result.paye,
          accLevy: result.accLevy,
          kiwiSaverEmployee: result.kiwiSaverEmployee,
          kiwiSaverEmployer: result.kiwiSaverEmployer,
          studentLoan: result.studentLoan,
          netPay: result.netPay,
          employerCost: result.employerCost,
          breakdown: result.breakdown as never,
        },
      })

      for (const accruedOn of result.alternativeDayDates) {
        await tx.alternativeDay.create({
          data: { staffId, venueId, payPeriodId, accruedOn: new Date(`${accruedOn}T00:00:00Z`) },
        })
      }

      created++
    }

    await tx.payPeriod.update({
      where: { id: payPeriodId },
      data: { status: 'CLOSED', closedById, paidAt: null },
    })
  })

  return created
}
