import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { noticeWhereOr } from '@/lib/notice-audience'
import { allowedResponses, isResponseOpen, isStaffEventOver, responseDeadlineAt, wallClockNow } from '@/lib/staff-events'

// Active notices for this worker's venue/department, with their ack status.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // The worker JWT carries departmentId but not sections/roles, so load them.
  const [staff, venue] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: session.staffId },
      select: {
        departmentId: true,
        sections: { select: { sectionId: true } },
        positions: { select: { positionId: true } },
      },
    }),
    prisma.venue.findUnique({ where: { id: session.venueId }, select: { timezone: true } }),
  ])
  const ctx = {
    departmentId: staff?.departmentId ?? session.departmentId ?? null,
    sectionIds: new Set((staff?.sections ?? []).map((s) => s.sectionId)),
    positionIds: new Set((staff?.positions ?? []).map((p) => p.positionId)),
  }

  const now = new Date()
  const wallNow = wallClockNow(now, venue?.timezone)
  const notices = await prisma.notice.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      venueId: session.venueId,
      OR: [
        ...noticeWhereOr(ctx),
        // A staff event reaches its invitees even when a narrow audience would
        // not match them (explicit individual invitees).
        { staffEvent: { is: { invites: { some: { staffId: session.staffId, deletedAt: null } } } } },
      ],
      AND: [
        {
          OR: [
            // Staff-event windows are wall-clock dates: evaluate them in JS
            // below against the venue wall clock, not the server's real now.
            { staffEventId: { not: null } },
            {
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
              ],
            },
          ],
        },
      ],
    },
    include: {
      acks: { where: { staffId: session.staffId }, select: { id: true } },
      staffEvent: {
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
          invites: {
            where: { staffId: session.staffId },
            select: { id: true, response: true, respondedAt: true, reason: true, reminderSentAt: true, deletedAt: true },
          },
        },
      },
    },
    orderBy: [{ pinned: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  })

  const items = notices.flatMap((n) => {
    const staffEvent = n.staffEvent
    const eventInvite = staffEvent?.invites[0] ?? null
    // Staff-event notices are delivered only to people with a live invite and
    // retire once the event has passed (venue wall clock).
    if (n.staffEventId) {
      if (!staffEvent || !eventInvite || eventInvite.deletedAt) return []
      if (staffEvent.status !== 'PUBLISHED' || isStaffEventOver(staffEvent, wallNow)) return []
    }
    const response = eventInvite?.response ?? 'PENDING'
    return [{
      id: n.id,
      title: n.title,
      body: n.body,
      priority: n.priority,
      // A staff-event notice is only pinned while the person hasn't replied;
      // after responding it stays visible (until the event passes) but moves
      // out of the PINNED block.
      pinned: n.staffEventId ? response === 'PENDING' : n.pinned,
      requiresAck: n.requiresAck,
      acked: n.acks.length > 0,
      createdAt: n.createdAt,
      staffEvent: staffEvent && eventInvite
        ? {
            id: staffEvent.id,
            title: staffEvent.title,
            description: staffEvent.description,
            location: staffEvent.location,
            startsAt: staffEvent.startsAt,
            endsAt: staffEvent.endsAt,
            allDay: staffEvent.allDay,
            attendanceRequired: staffEvent.attendanceRequired,
            allowMaybe: staffEvent.allowMaybe,
            requireDeclineReason: staffEvent.requireDeclineReason,
            responseDeadline: responseDeadlineAt(staffEvent),
            notes: staffEvent.notes,
            status: staffEvent.status,
            organiserName: staffEvent.createdBy
              ? `${staffEvent.createdBy.firstName} ${staffEvent.createdBy.lastName}`
              : null,
            reminderSentAt: eventInvite.reminderSentAt ?? staffEvent.reminderSentAt,
            response,
            respondedAt: eventInvite.respondedAt,
            reason: eventInvite.reason,
            canRespond: isResponseOpen(staffEvent, wallNow),
            allowedResponses: allowedResponses(staffEvent.allowMaybe),
            icsUrl: `/api/worker/staff-events/${staffEvent.id}/ics`,
          }
        : undefined,
    }]
  })

  const unackedRequired = items.filter((n) => n.requiresAck && !n.acked).length

  return NextResponse.json({ firstName: session.firstName, items, unackedRequired })
}
