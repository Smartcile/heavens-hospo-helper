import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { PUSH_FAILURE_MESSAGES, pushEventToBookings } from '@/lib/event-booking'

type Params = { params: { id: string } }

/** POST /api/worker/events/[id]/push — push the event for the worker's venue. */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const event = await prisma.event.findFirst({
    where: { id: params.id, venueId: session!.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await pushEventToBookings(params.id, session!.venueId)
  if (!result.ok) {
    return NextResponse.json(
      { error: PUSH_FAILURE_MESSAGES[result.reason] ?? 'Could not push this event', reason: result.reason },
      { status: result.reason === 'NOT_FOUND' ? 404 : 400 },
    )
  }
  return NextResponse.json(result)
}
