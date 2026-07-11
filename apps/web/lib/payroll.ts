import { prisma } from '@hospo-ops/db'

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

export async function generatePayPeriod(
  payPeriodId: string,
  venueId: string,
  startDate: Date,
  endDate: Date
): Promise<number> {
  // If re-closing a CLOSED period, clear old entries first.
  await prisma.payrollEntry.deleteMany({ where: { payPeriodId } })

  // Find all staff who have clocked during this period.
  const clocked = await prisma.timeClock.findMany({
    where: {
      venueId,
      isActive: false,
      clockOut: { not: null },
      clockIn: { gte: startDate, lte: endDate },
      deletedAt: null,
    },
    select: { staffId: true },
    distinct: ['staffId'],
  })

  let created = 0
  for (const { staffId } of clocked) {
    const { totalHours } = await calculateStaffHours(staffId, venueId, startDate, endDate)

    const staff = await prisma.staff.findUnique({
      where: { id: staffId },
      select: { hourlyRate: true },
    })

    const hourlyRate = staff?.hourlyRate ?? 0
    const totalPay = Math.round(totalHours * hourlyRate * 100) / 100

    await prisma.payrollEntry.create({
      data: { payPeriodId, staffId, totalHours, hourlyRate, totalPay },
    })

    created++
  }

  await prisma.payPeriod.update({
    where: { id: payPeriodId },
    data: { status: 'CLOSED' },
  })

  return created
}
