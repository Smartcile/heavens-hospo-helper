import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { buildStaffEventIcs } from '@/lib/staff-events'

interface Params {
  params: { id: string }
}

export async function GET(_req: Request, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await prisma.staffEvent.findFirst({
    where: { id: params.id, deletedAt: null, venueId: session.venueId },
    include: {
      createdBy: { select: { firstName: true, lastName: true } },
      invites: { where: { staffId: session.staffId }, select: { id: true, deletedAt: true } },
    },
  })
  if (!event) return NextResponse.json({ error: 'EVENT NOT FOUND' }, { status: 404 })
  if (!event.invites[0] || event.invites[0].deletedAt) {
    return NextResponse.json({ error: 'YOU ARE NOT INVITED TO THIS EVENT' }, { status: 404 })
  }

  const ics = buildStaffEventIcs({
    uid: `staff-event-${event.id}@hospo-ops`,
    title: event.title,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    organiserName: event.createdBy ? `${event.createdBy.firstName} ${event.createdBy.lastName}` : null,
  })

  const filename = `${event.title.replace(/[^A-Z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'staff-event'}.ics`
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
