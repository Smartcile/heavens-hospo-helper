import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { mondayOf } from '@/lib/date-nav'
import { buildCopyWeekRows, isDateKey, normaliseApplyMode, weekRange } from '@/lib/roster-template'
import { writeShiftWeek, type DraftShiftData } from '@/lib/roster-week.server'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

// Copy one week's roster directly onto another. ADD appends to the target
// week; REPLACE clears it first. Creates DRAFT shifts and skips inactive staff.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = await req.json()
  const { venueId: requestedVenueId, sourceStart, targetStart, mode } = body as {
    venueId?: string
    sourceStart?: string
    targetStart?: string
    mode?: string
  }

  const scoped = resolveScopedVenueId(session, req, requestedVenueId)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { venueId } = scoped

  if (!isDateKey(sourceStart) || !isDateKey(targetStart)) {
    return NextResponse.json({ error: 'SOURCE AND TARGET WEEK MUST BE YYYY-MM-DD' }, { status: 400 })
  }
  const sourceWeekStart = mondayOf(sourceStart)
  const targetWeekStart = mondayOf(targetStart)
  if (sourceWeekStart === targetWeekStart) {
    return NextResponse.json({ error: 'SOURCE AND TARGET WEEK ARE THE SAME' }, { status: 400 })
  }
  const copyMode = normaliseApplyMode(mode)

  const { start, end } = weekRange(sourceWeekStart)
  const [sourceShifts, staff] = await Promise.all([
    prisma.shift.findMany({
      where: {
        venueId,
        deletedAt: null,
        date: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T23:59:59Z`) },
      },
      select: {
        staffId: true,
        positionId: true,
        date: true,
        startTime: true,
        endTime: true,
        breakMinutes: true,
        colour: true,
        tag: true,
        note: true,
      },
      orderBy: { startTime: 'asc' },
    }),
    prisma.staff.findMany({
      where: { venueId, deletedAt: null, isActive: true },
      select: { id: true, departmentId: true },
    }),
  ])

  const staffIds = new Set(staff.map((s) => s.id))
  const departmentByStaff = new Map(staff.map((s) => [s.id, s.departmentId]))
  const plan = buildCopyWeekRows(
    sourceShifts.map((s) => ({ ...s, date: s.date.toISOString().slice(0, 10) })),
    sourceWeekStart,
    targetWeekStart,
    staffIds,
  )

  if (plan.rows.length === 0) {
    return NextResponse.json(
      { error: 'NO SHIFTS TO COPY', skippedStaffIds: plan.skippedStaffIds },
      { status: 422 },
    )
  }

  const rows: DraftShiftData[] = plan.rows.map((r) => ({
    staffId: r.staffId,
    venueId,
    departmentId: departmentByStaff.get(r.staffId) ?? null,
    positionId: r.positionId,
    date: new Date(`${r.date}T00:00:00Z`),
    startTime: r.startTime,
    endTime: r.endTime,
    breakMinutes: r.breakMinutes,
    colour: r.colour,
    tag: r.tag,
    note: r.note,
    status: 'DRAFT',
    createdById: session.user.id,
  }))

  const result = await writeShiftWeek(venueId, targetWeekStart, copyMode, rows)
  return NextResponse.json({
    ...result,
    weekStart: targetWeekStart,
    mode: copyMode,
    skippedStaffIds: plan.skippedStaffIds,
  })
}
