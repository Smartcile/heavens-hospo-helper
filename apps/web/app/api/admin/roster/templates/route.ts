import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { mondayOf } from '@/lib/date-nav'
import { normaliseWeekToTemplate, isDateKey, weekRange } from '@/lib/roster-template'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

// Roster week templates: list a venue's saved weeks, or capture the current
// week as a new template (normalised to Monday–Sunday day indexes).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req, req.nextUrl.searchParams.get('venueId'))
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { venueId } = scoped

  const templates = await prisma.rosterTemplate.findMany({
    where: { venueId, deletedAt: null },
    include: { shifts: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })

  const staffIds = [...new Set(templates.flatMap((t) => t.shifts.map((s) => s.staffId)))]
  const positionIds = [...new Set(templates.flatMap((t) => t.shifts.map((s) => s.positionId).filter((id): id is string => !!id)))]
  const [staff, positions] = await Promise.all([
    staffIds.length
      ? prisma.staff.findMany({ where: { id: { in: staffIds }, deletedAt: null }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
    positionIds.length
      ? prisma.position.findMany({ where: { id: { in: positionIds } }, select: { id: true, name: true, colour: true } })
      : Promise.resolve([]),
  ])
  const staffName = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))
  const positionName = new Map(positions.map((p) => [p.id, p.name]))
  const positionColour = new Map(positions.map((p) => [p.id, p.colour]))

  return NextResponse.json({
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      notes: t.notes,
      createdAt: t.createdAt,
      shifts: t.shifts.map((s) => ({
        ...s,
        staffName: staffName.get(s.staffId) ?? null,
        positionName: s.positionId ? positionName.get(s.positionId) ?? null : null,
        positionColour: s.positionId ? positionColour.get(s.positionId) ?? null : null,
      })),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = await req.json()
  const { venueId: requestedVenueId, name, notes, start } = body as {
    venueId?: string
    name?: string
    notes?: string
    start?: string
  }

  const scoped = resolveScopedVenueId(session, req, requestedVenueId)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { venueId } = scoped

  const templateName = String(name ?? '').toUpperCase().trim()
  if (!templateName) return NextResponse.json({ error: 'NAME IS REQUIRED' }, { status: 400 })
  if (!isDateKey(start)) return NextResponse.json({ error: 'START MUST BE YYYY-MM-DD' }, { status: 400 })

  const weekStart = mondayOf(start)
  const { start: rangeStart, end: rangeEnd } = weekRange(weekStart)
  const shifts = await prisma.shift.findMany({
    where: {
      venueId,
      deletedAt: null,
      date: { gte: new Date(`${rangeStart}T00:00:00Z`), lte: new Date(`${rangeEnd}T23:59:59Z`) },
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
  })

  const templateShifts = normaliseWeekToTemplate(
    shifts.map((s) => ({ ...s, date: s.date.toISOString().slice(0, 10) })),
    weekStart,
  )
  if (templateShifts.length === 0) {
    return NextResponse.json({ error: 'NO SHIFTS IN THIS WEEK TO SAVE' }, { status: 422 })
  }

  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.rosterTemplate.create({
      data: {
        venueId,
        name: templateName,
        notes: notes?.trim() || null,
      },
    })
    await tx.rosterTemplateShift.createMany({
      data: templateShifts.map((s) => ({ ...s, templateId: created.id })),
    })
    return created
  })

  return NextResponse.json({ template, shifts: templateShifts.length }, { status: 201 })
}
