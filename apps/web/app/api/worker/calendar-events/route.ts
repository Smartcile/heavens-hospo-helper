import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { summariseCalendarEvent } from '@/lib/checklist-activation'

// Read-only venue event options for the worker checklist event picker. Only
// authoring users reach the list editor, so the options stay behind the same
// gate (no event feed for floor staff who cannot edit lists).
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canAuthor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const events = await prisma.calendarEvent.findMany({
    where: { venueId: session.venueId, deletedAt: null },
    select: { id: true, venueId: true, title: true, startsAt: true, endsAt: true, allDay: true },
    orderBy: { startsAt: 'asc' },
    take: 1000,
  })
  return NextResponse.json(events.map(summariseCalendarEvent))
}
