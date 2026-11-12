import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { validateRosterSlot } from '@/lib/roster-slot'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const existing = await prisma.rosterSlot.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const scoped = resolveScopedVenueId(session, req, existing.venueId)
  if ('error' in scoped || scoped.venueId !== existing.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { name, positionId, startTime, endTime, breakMinutes, headcount, colour, tag, isActive, sortOrder } = body as {
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

  const errors = validateRosterSlot({ name, startTime, endTime, breakMinutes, headcount })
  if (errors.length > 0) return NextResponse.json({ error: errors.join(' · ') }, { status: 400 })

  if (positionId) {
    const position = await prisma.position.findFirst({
      where: { id: positionId, venueId: existing.venueId, deletedAt: null },
      select: { id: true },
    })
    if (!position) return NextResponse.json({ error: 'UNKNOWN POSITION' }, { status: 400 })
  }

  const slot = await prisma.rosterSlot.update({
    where: { id: params.id },
    data: {
      name: String(name).toUpperCase().trim(),
      positionId: positionId || null,
      startTime: String(startTime),
      endTime: String(endTime),
      breakMinutes: Math.max(0, Math.round(Number(breakMinutes) || 0)),
      headcount: Math.trunc(Number(headcount)),
      colour: colour || null,
      tag: tag?.trim() || null,
      isActive: isActive !== false,
      sortOrder: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : existing.sortOrder,
    },
  })

  return NextResponse.json(slot)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const existing = await prisma.rosterSlot.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const scoped = resolveScopedVenueId(session, req, existing.venueId)
  if ('error' in scoped || scoped.venueId !== existing.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.rosterSlot.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
