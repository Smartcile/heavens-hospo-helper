import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { cleanNoticeAudiences } from '@/lib/notice-audience'
import { attendanceFor, buildStaffEventFields } from '@/lib/staff-events'
import {
  materialiseStaffEventInvites,
  staffEventNoticeBody,
  syncStaffEventNotice,
  type StaffEventWithAudiences,
} from '@/lib/staff-events.server'

function eventWithAudiences(
  event: { id: string; venueId: string; title: string; description: string | null; location: string | null; startsAt: Date; endsAt: Date | null; allDay: boolean; attendanceRequired: boolean; status: string },
  audiences: { kind: string; targetId: string }[],
): StaffEventWithAudiences {
  return { ...event, audiences }
}

async function cleanStaffIds(venueId: string, raw: unknown): Promise<string[] | null> {
  if (!Array.isArray(raw)) return []
  const ids = [...new Set(raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()))]
  if (ids.length === 0) return []
  const count = await prisma.staff.count({ where: { id: { in: ids }, venueId, deletedAt: null, isActive: true } })
  return count === ids.length ? ids : null
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.view')
  if (denied) return denied

  const { searchParams } = req.nextUrl
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  const events = await prisma.staffEvent.findMany({
    where: { deletedAt: null, ...(venueScope ? { venueId: venueScope } : {}) },
    include: {
      audiences: { select: { kind: true, targetId: true } },
      invites: { where: { deletedAt: null }, select: { response: true } },
      venue: { select: { id: true, name: true } },
    },
    orderBy: [{ startsAt: 'asc' }],
  })

  return NextResponse.json(events.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    allDay: e.allDay,
    attendanceRequired: e.attendanceRequired,
    allowMaybe: e.allowMaybe,
    requireDeclineReason: e.requireDeclineReason,
    responseDeadline: e.responseDeadline,
    notes: e.notes,
    status: e.status,
    reminderSentAt: e.reminderSentAt,
    venueId: e.venueId,
    venueName: e.venue.name,
    audiences: e.audiences,
    attendance: attendanceFor(e.invites),
  })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.post')
  if (denied) return denied

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'INVALID REQUEST' }, { status: 400 })

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : (typeof body.venueId === 'string' && body.venueId) || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'VENUE IS REQUIRED' }, { status: 400 })

  const built = buildStaffEventFields(body)
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 })

  const audiences = cleanNoticeAudiences(body.audiences)
  const staffIds = await cleanStaffIds(venueId, body.staffIds)
  if (staffIds === null) return NextResponse.json({ error: 'ONE OR MORE INVITEES ARE NOT ACTIVE STAFF AT THIS VENUE' }, { status: 400 })
  const publish = body.publish !== false

  try {
    const id = await prisma.$transaction(async (tx) => {
      const created = await tx.staffEvent.create({
        data: {
          ...built.value,
          venueId,
          status: publish ? 'PUBLISHED' : 'DRAFT',
          createdById: session.user.id,
          audiences: audiences.length ? { create: audiences.map((a) => ({ kind: a.kind, targetId: a.targetId })) } : undefined,
        },
        select: {
          id: true, venueId: true, title: true, description: true, location: true,
          startsAt: true, endsAt: true, allDay: true, attendanceRequired: true, status: true,
        },
      })
      const event = eventWithAudiences(created, audiences)
      // Invitees are materialised even on a DRAFT so explicit invitees are
      // remembered; the linked Notice only goes out on publish.
      await materialiseStaffEventInvites(tx, event, staffIds)
      if (publish) await syncStaffEventNotice(tx, event)
      return created.id
    })

    return NextResponse.json({
      event: { id, title: built.value.title, body: staffEventNoticeBody({ ...built.value }) },
    }, { status: 201 })
  } catch (e) {
    console.error('staff event create failed', e)
    return NextResponse.json({ error: 'SAVE FAILED' }, { status: 500 })
  }
}
