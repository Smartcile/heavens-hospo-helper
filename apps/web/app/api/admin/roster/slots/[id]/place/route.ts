import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { isDateKey } from '@/lib/roster-template'
import { planSlotPlacement } from '@/lib/roster-slot'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

// Place a slot on a chosen day. Each selected staff member gets a matching
// DRAFT shift for the slot's role/time/break. Unselected seats are reported.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const slot = await prisma.rosterSlot.findUnique({ where: { id: params.id } })
  if (!slot || slot.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const scoped = resolveScopedVenueId(session, req, slot.venueId)
  if ('error' in scoped || scoped.venueId !== slot.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { date, staffIds } = body as { date?: string; staffIds?: string[] }
  if (!isDateKey(date)) return NextResponse.json({ error: 'DATE MUST BE YYYY-MM-DD' }, { status: 400 })
  if (!slot.isActive) return NextResponse.json({ error: 'THIS SLOT IS INACTIVE' }, { status: 409 })

  const [staff, position] = await Promise.all([
    prisma.staff.findMany({
      where: { id: { in: Array.isArray(staffIds) ? staffIds : [] }, venueId: slot.venueId, deletedAt: null, isActive: true },
      select: { id: true, departmentId: true },
    }),
    slot.positionId
      ? prisma.position.findFirst({
        where: { id: slot.positionId, venueId: slot.venueId, deletedAt: null },
        select: { id: true },
      })
      : Promise.resolve(null),
  ])
  const clearedPositionId = slot.positionId && !position ? slot.positionId : null
  const staffIdsValid = new Set(staff.map((s) => s.id))
  const departmentByStaff = new Map(staff.map((s) => [s.id, s.departmentId]))
  const plan = planSlotPlacement(slot.headcount, Array.isArray(staffIds) ? staffIds : [], staffIdsValid)
  if (plan.error) return NextResponse.json({ ...plan, error: plan.error }, { status: 422 })
  if (plan.selected.length === 0) {
    return NextResponse.json(
      { error: 'SELECT AT LEAST ONE STAFF MEMBER', skippedSeats: plan.skippedSeats },
      { status: 422 },
    )
  }

  const shiftDate = new Date(`${date}T00:00:00Z`)
  await prisma.shift.createMany({
    data: plan.selected.map((staffId) => ({
      staffId,
      venueId: slot.venueId,
      departmentId: departmentByStaff.get(staffId) ?? null,
      positionId: clearedPositionId ? null : slot.positionId,
      date: shiftDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      breakMinutes: slot.breakMinutes,
      colour: slot.colour,
      tag: slot.tag || slot.name,
      status: 'DRAFT' as const,
      createdById: session.user.id,
    })),
  })

  return NextResponse.json({
    created: plan.selected.length,
    skippedSeats: plan.skippedSeats,
    skippedStaffIds: plan.skippedStaffIds,
    clearedPositionId,
    date,
  })
}
