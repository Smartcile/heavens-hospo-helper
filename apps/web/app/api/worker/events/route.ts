import { NextRequest, NextResponse } from 'next/server'
import { prisma, Prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { buildEventData, eventInclude } from '@/lib/events.server'

// ── Worker event management ──────────────────────────────────────────────
// Managers / granted floor staff can create and edit BEOs from the phone. The
// venue is ALWAYS the worker's own — no client-supplied venue is trusted.

/** GET /api/worker/events — this venue's events, newest first. */
export async function GET() {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const events = await prisma.event.findMany({
    where: { venueId: session!.venueId, deletedAt: null },
    include: {
      customer: { select: { id: true, name: true } },
      menu: { select: { id: true, name: true } },
      setup: { select: { id: true, name: true } },
      blocks: {
        where: { deletedAt: null },
        select: { id: true, type: true, title: true, config: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      },
      _count: { select: { changeRequests: { where: { status: 'PENDING', deletedAt: null } } } },
    },
    orderBy: [{ eventDate: 'desc' }, { startTime: 'asc' }],
    take: 200,
  })

  return NextResponse.json(events)
}

/** POST /api/worker/events — create an event for the worker's venue. */
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { data, error } = buildEventData(body)
  if (error) return NextResponse.json({ error }, { status: 400 })
  if (!data.name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!data.eventDate) return NextResponse.json({ error: 'Event date is required' }, { status: 400 })

  const event = await prisma.event.create({
    data: {
      ...(data as Prisma.EventUncheckedCreateInput),
      venueId: session!.venueId,
      history: [
        { at: new Date().toISOString(), type: 'CREATED', note: 'EVENT CREATED ON THE WORKER APP' },
      ] as Prisma.InputJsonValue,
    },
    include: eventInclude,
  })

  return NextResponse.json(event, { status: 201 })
}
