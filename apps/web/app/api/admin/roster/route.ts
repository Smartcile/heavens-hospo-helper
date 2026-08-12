import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { dateKeysBetween } from '@/lib/calendar'
import { formatDateKey } from '@/lib/scheduling'
import { rosterWeekSummary, type RosterShift } from '@/lib/roster-math'

// The week grid payload for the Roster Editor: staff (with rates, positions,
// departments), their shifts (with position colours), approved time-off that
// blocks days, and the Budget module's daily REVENUE allocations for the
// "Budgeted Sales" footer.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const venueId = url.searchParams.get('venueId') || session.user.venueId
  const startKey = url.searchParams.get('start') || formatDateKey(new Date())
  const endKey = url.searchParams.get('end') || startKey
  const start = new Date(`${startKey}T00:00:00Z`)
  const end = new Date(`${endKey}T23:59:59Z`)

  const [staff, shifts, timeOff, budgetDays] = await Promise.all([
    prisma.staff.findMany({
      where: { venueId, deletedAt: null, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hourlyRate: true,
        employmentType: true,
        department: { select: { name: true } },
        positions: {
          select: { position: { select: { id: true, name: true, colour: true } } },
        },
      },
      orderBy: { firstName: 'asc' },
    }),
    prisma.shift.findMany({
      where: { venueId, deletedAt: null, date: { gte: start, lte: end } },
      include: { position: { select: { name: true, colour: true } } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.timeOffRequest.findMany({
      where: {
        venueId,
        deletedAt: null,
        status: 'APPROVED',
        endDate: { gte: start },
        startDate: { lte: end },
      },
      select: { staffId: true, startDate: true, endDate: true },
    }),
    prisma.budgetDay.findMany({
      where: { date: { gte: start, lte: end } },
      include: {
        allocations: { include: { category: { select: { name: true } } } },
      },
    }),
  ])

  const budgetedSalesByDate: Record<string, number> = {}
  for (const day of budgetDays) {
    const key = formatDateKey(day.date)
    budgetedSalesByDate[key] = day.allocations
      .filter((a) => a.category.name.toUpperCase() === 'REVENUE')
      .reduce((sum, a) => sum + a.amount, 0)
  }

  // Approved time-off blocks out day cells per staff member.
  const blockedDays: Record<string, string[]> = {} // staffId -> date keys
  for (const t of timeOff) {
    const keys = dateKeysBetween(t.startDate, t.endDate)
    blockedDays[t.staffId] = [...(blockedDays[t.staffId] ?? []), ...keys]
  }

  const shiftsOut: RosterShift[] = shifts.map((s) => ({
    id: s.id,
    staffId: s.staffId,
    date: formatDateKey(s.date),
    startTime: s.startTime,
    endTime: s.endTime,
    breakMinutes: s.breakMinutes,
    colour: s.colour,
    tag: s.tag,
    status: s.status,
    positionName: s.position?.name ?? null,
    positionColour: s.position?.colour ?? null,
  }))

  const rates = staff.map((s) => ({ staffId: s.id, hourlyRate: s.hourlyRate }))
  const summary = rosterWeekSummary(shiftsOut, rates, budgetedSalesByDate)

  return NextResponse.json({
    staff: staff.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      hourlyRate: s.hourlyRate,
      employmentType: s.employmentType,
      departmentName: s.department?.name ?? null,
      positions: s.positions.map((p) => ({ id: p.position.id, name: p.position.name, colour: p.position.colour })),
    })),
    shifts: shiftsOut,
    blockedDays,
    budgetedSalesByDate,
    summary,
  })
}
