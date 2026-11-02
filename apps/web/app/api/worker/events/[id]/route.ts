import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { buildEventData, eventInclude, logEventEvent } from '@/lib/events.server'

type Params = { params: { id: string } }

/** GET /api/worker/events/[id] — one event for the worker's venue. */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const event = await prisma.event.findFirst({
    where: { id: params.id, venueId: session!.venueId, deletedAt: null },
    include: eventInclude,
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(event)
}

/** PUT /api/worker/events/[id] — edit an event for the worker's venue. */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const existing = await prisma.event.findFirst({
    where: { id: params.id, venueId: session!.venueId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { data, error } = buildEventData(body)
  if (error) return NextResponse.json({ error }, { status: 400 })

  const event = await prisma.event.update({
    where: { id: params.id },
    data: data as Prisma.EventUncheckedUpdateInput,
    include: eventInclude,
  })

  if (typeof data.status === 'string' && data.status !== existing.status) {
    await logEventEvent(params.id, 'STATUS', `STATUS ${existing.status} → ${data.status}`)
  }

  return NextResponse.json(event)
}
