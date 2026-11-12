import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { mondayOf } from '@/lib/date-nav'
import { buildTemplateWeekRows, isDateKey, normaliseApplyMode } from '@/lib/roster-template'
import { writeShiftWeek, type DraftShiftData } from '@/lib/roster-week.server'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

// Apply a saved template to a target week. Creates DRAFT shifts; missing or
// inactive staff are skipped and reported.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = await req.json()
  const { venueId: requestedVenueId, weekStart, mode } = body as {
    venueId?: string
    weekStart?: string
    mode?: string
  }

  const scoped = resolveScopedVenueId(session, req, requestedVenueId)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { venueId } = scoped

  if (!isDateKey(weekStart)) return NextResponse.json({ error: 'WEEK START MUST BE YYYY-MM-DD' }, { status: 400 })
  const targetWeekStart = mondayOf(weekStart)
  const applyMode = normaliseApplyMode(mode)

  const template = await prisma.rosterTemplate.findUnique({
    where: { id: params.id },
    include: { shifts: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!template || template.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (template.venueId !== venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const staff = await prisma.staff.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    select: { id: true, departmentId: true },
  })
  const staffIds = new Set(staff.map((s) => s.id))
  const departmentByStaff = new Map(staff.map((s) => [s.id, s.departmentId]))

  const plan = buildTemplateWeekRows(template.shifts, targetWeekStart, staffIds)
  if (plan.rows.length === 0) {
    return NextResponse.json(
      { error: 'NO ACTIVE STAFF IN THIS TEMPLATE', skippedStaffIds: plan.skippedStaffIds },
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

  const result = await writeShiftWeek(venueId, targetWeekStart, applyMode, rows)
  return NextResponse.json({
    ...result,
    weekStart: targetWeekStart,
    mode: applyMode,
    skippedStaffIds: plan.skippedStaffIds,
  })
}
