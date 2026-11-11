import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { cleanNoticeAudiences } from '@/lib/notice-audience'
import { attendanceFor, buildStaffEventFields } from '@/lib/staff-events'
import {
  materialiseStaffEventInvites,
  syncStaffEventNotice,
  type StaffEventWithAudiences,
} from '@/lib/staff-events.server'

interface Params {
  params: { id: string }
}

function managerBlocked(session: { user: { role: string; venueId: string } }, venueId: string): boolean {
  return session.user.role === 'MANAGER' && venueId !== session.user.venueId
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.view')
  if (denied) return denied

  const event = await prisma.staffEvent.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      audiences: { select: { kind: true, targetId: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      invites: {
        where: { deletedAt: null },
        include: { staff: { select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } } } },
        orderBy: [{ response: 'asc' }, { staff: { lastName: 'asc' } }],
      },
    },
  })
  if (!event) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  if (managerBlocked(session, event.venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    attendanceRequired: event.attendanceRequired,
    allowMaybe: event.allowMaybe,
    requireDeclineReason: event.requireDeclineReason,
    responseDeadline: event.responseDeadline,
    notes: event.notes,
    status: event.status,
    reminderSentAt: event.reminderSentAt,
    venueId: event.venueId,
    organiserName: event.createdBy ? `${event.createdBy.firstName} ${event.createdBy.lastName}` : null,
    audiences: event.audiences,
    attendance: attendanceFor(event.invites),
    invites: event.invites.map((i) => ({
      id: i.id,
      staffId: i.staffId,
      staffName: `${i.staff.firstName} ${i.staff.lastName}`,
      departmentName: i.staff.department?.name ?? null,
      response: i.response,
      respondedAt: i.respondedAt,
      reason: i.reason,
      reminderSentAt: i.reminderSentAt,
    })),
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.post')
  if (denied) return denied

  const existing = await prisma.staffEvent.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { audiences: { select: { kind: true, targetId: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  if (managerBlocked(session, existing.venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'INVALID REQUEST' }, { status: 400 })
  const built = buildStaffEventFields(body)
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 })

  const audiences = body.audiences !== undefined
    ? cleanNoticeAudiences(body.audiences)
    : existing.audiences.map((a) => ({ kind: a.kind as 'DEPARTMENT' | 'SECTION' | 'POSITION', targetId: a.targetId }))

  let staffIds: string[] | null = null
  if (Array.isArray(body.staffIds)) {
    const ids = [...new Set(body.staffIds.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()))]
    if (ids.length) {
      const count = await prisma.staff.count({ where: { id: { in: ids }, venueId: existing.venueId, deletedAt: null, isActive: true } })
      if (count !== ids.length) return NextResponse.json({ error: 'ONE OR MORE INVITEES ARE NOT ACTIVE STAFF AT THIS VENUE' }, { status: 400 })
    }
    staffIds = ids
  }

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.staffEvent.update({
        where: { id: existing.id },
        data: {
          ...built.value,
          audiences: body.audiences !== undefined ? { deleteMany: {}, create: audiences } : undefined,
        },
        select: {
          id: true, venueId: true, title: true, description: true, location: true,
          startsAt: true, endsAt: true, allDay: true, attendanceRequired: true, status: true,
        },
      })
      const event: StaffEventWithAudiences = { ...updated, audiences }
      if (updated.status === 'PUBLISHED') {
        await materialiseStaffEventInvites(tx, event, staffIds ?? [])
        await syncStaffEventNotice(tx, event)
      }
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('staff event update failed', e)
    return NextResponse.json({ error: 'SAVE FAILED' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.delete')
  if (denied) return denied

  const existing = await prisma.staffEvent.findFirst({ where: { id: params.id, deletedAt: null }, select: { id: true, venueId: true } })
  if (!existing) return NextResponse.json({ error: 'NOT FOUND' }, { status: 404 })
  if (managerBlocked(session, existing.venueId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.staffEvent.update({ where: { id: existing.id }, data: { deletedAt: now, status: 'CANCELLED' } })
    await tx.notice.updateMany({ where: { staffEventId: existing.id, deletedAt: null }, data: { deletedAt: now, isActive: false } })
    await tx.staffEventInvite.updateMany({ where: { staffEventId: existing.id, deletedAt: null }, data: { deletedAt: now } })
  })

  return NextResponse.json({ success: true })
}
