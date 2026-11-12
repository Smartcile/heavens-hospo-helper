import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { validateRosterSlot } from '@/lib/roster-slot'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

// Reusable working slots (shift presets: role + time window + headcount).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req, req.nextUrl.searchParams.get('venueId'))
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { venueId } = scoped

  const [slots, positions] = await Promise.all([
    prisma.rosterSlot.findMany({ where: { venueId, deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    prisma.position.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true, colour: true } }),
  ])
  const positionName = new Map(positions.map((p) => [p.id, p.name]))
  const positionColour = new Map(positions.map((p) => [p.id, p.colour]))

  return NextResponse.json({
    slots: slots.map((s) => ({
      ...s,
      positionName: s.positionId ? positionName.get(s.positionId) ?? null : null,
      positionColour: s.positionId ? positionColour.get(s.positionId) ?? null : null,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = await req.json()
  const { venueId: requestedVenueId, name, positionId, startTime, endTime, breakMinutes, headcount, colour, tag, isActive, sortOrder } = body as {
    venueId?: string
    name?: string
    positionId?: string | null
    startTime?: string
    endTime?: string
    breakMinutes?: number
    headcount?: number
    colour?: string | null
    tag?: string | null
    isActive?: boolean
    sortOrder?: number
  }

  const scoped = resolveScopedVenueId(session, req, requestedVenueId)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { venueId } = scoped

  const errors = validateRosterSlot({ name, startTime, endTime, breakMinutes, headcount })
  if (errors.length > 0) return NextResponse.json({ error: errors.join(' · ') }, { status: 400 })

  if (positionId) {
    const position = await prisma.position.findFirst({
      where: { id: positionId, venueId, deletedAt: null },
      select: { id: true },
    })
    if (!position) return NextResponse.json({ error: 'UNKNOWN POSITION' }, { status: 400 })
  }

  const slot = await prisma.rosterSlot.create({
    data: {
      venueId,
      name: String(name).toUpperCase().trim(),
      positionId: positionId || null,
      startTime: String(startTime),
      endTime: String(endTime),
      breakMinutes: Math.max(0, Math.round(Number(breakMinutes) || 0)),
      headcount: Math.trunc(Number(headcount)),
      colour: colour || null,
      tag: tag?.trim() || null,
      isActive: isActive !== false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    },
  })

  return NextResponse.json(slot, { status: 201 })
}
