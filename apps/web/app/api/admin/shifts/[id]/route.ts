import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { isValidTime } from '@/lib/calendar'
import { releaseSeatForShift, syncShiftSeatLinks } from '@/lib/open-shifts.server'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'calendar.calendar.edit')
  if (denied) return denied
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.shift.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.staffId !== undefined && body.staffId !== existing.staffId) {
    const target = await prisma.staff.findUnique({
      where: { id: body.staffId },
      select: { id: true, venueId: true, departmentId: true },
    })
    if (!target) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    if (target.venueId !== existing.venueId) {
      return NextResponse.json({ error: 'That staff member is at another venue' }, { status: 400 })
    }
    if (session.user.role === 'MANAGER' && target.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    updates.staffId = target.id
    if (body.departmentId === undefined) updates.departmentId = target.departmentId ?? null
  }
  if (body.startTime !== undefined) {
    if (!isValidTime(body.startTime)) return NextResponse.json({ error: 'startTime must be HH:mm' }, { status: 400 })
    updates.startTime = body.startTime
  }
  if (body.endTime !== undefined) {
    if (!isValidTime(body.endTime)) return NextResponse.json({ error: 'endTime must be HH:mm' }, { status: 400 })
    updates.endTime = body.endTime
  }
  if (body.date !== undefined) updates.date = new Date(body.date)
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.positionId !== undefined) updates.positionId = body.positionId || null
  if (body.calendarEventId !== undefined) {
    if (body.calendarEventId) {
      const event = await prisma.calendarEvent.findFirst({
        where: { id: body.calendarEventId, venueId: existing.venueId, deletedAt: null },
        select: { id: true },
      })
      if (!event) return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
      updates.calendarEventId = body.calendarEventId
    } else {
      updates.calendarEventId = null
    }
  }
  if (body.colour !== undefined) updates.colour = body.colour || null
  if (body.tag !== undefined) updates.tag = body.tag?.trim() || null
  if (body.breakMinutes !== undefined) updates.breakMinutes = Math.max(0, Math.round(Number(body.breakMinutes) || 0))
  if (body.status !== undefined) updates.status = body.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
  if (body.note !== undefined) updates.note = body.note?.trim() || null

  const shift = await prisma.shift.update({ where: { id: params.id }, data: updates })
  await syncShiftSeatLinks({ shift, previousEventId: existing.calendarEventId })
  return NextResponse.json(shift)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'calendar.calendar.edit')
  if (denied) return denied

  const existing = await prisma.shift.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    await tx.shift.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
    await releaseSeatForShift(params.id, tx)
  })
  return NextResponse.json({ success: true })
}
