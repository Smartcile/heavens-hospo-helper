import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { allowedResponses, isResponseOpen, responseDeadlineAt, wallClockNow } from '@/lib/staff-events'

interface Params {
  params: { id: string }
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await prisma.staffEvent.findFirst({
    where: { id: params.id, deletedAt: null, venueId: session.venueId, status: 'PUBLISHED' },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      venue: { select: { timezone: true } },
      invites: { where: { staffId: session.staffId }, select: { id: true, response: true, respondedAt: true, reason: true, reminderSentAt: true, deletedAt: true } },
    },
  })
  if (!event) return NextResponse.json({ error: 'EVENT NOT FOUND' }, { status: 404 })
  const invite = event.invites[0]
  if (!invite || invite.deletedAt) return NextResponse.json({ error: 'YOU ARE NOT INVITED TO THIS EVENT' }, { status: 404 })

  const now = new Date()
  const wallNow = wallClockNow(now, event.venue?.timezone)
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
    responseClosesAt: responseDeadlineAt(event),
    notes: event.notes,
    status: event.status,
    organiserName: event.createdBy ? `${event.createdBy.firstName} ${event.createdBy.lastName}` : null,
    response: invite.response,
    respondedAt: invite.respondedAt,
    reason: invite.reason,
    reminderSentAt: invite.reminderSentAt ?? event.reminderSentAt,
    canRespond: isResponseOpen(event, wallNow),
    allowedResponses: allowedResponses(event.allowMaybe),
    icsUrl: `/api/worker/staff-events/${event.id}/ics`,
  })
}
