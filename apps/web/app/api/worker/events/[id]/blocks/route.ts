import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import {
  type EventBlockInput,
  logEventEvent,
  saveEventBlocks,
  validateBlockPayload,
} from '@/lib/events.server'

type Params = { params: { id: string } }

/** PUT /api/worker/events/[id]/blocks — replace blocks for the worker's venue. */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const event = await prisma.event.findFirst({
    where: { id: params.id, venueId: session!.venueId, deletedAt: null },
    select: { id: true },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { blocks?: EventBlockInput[] }
  const blocks = Array.isArray(body.blocks) ? body.blocks : []

  const invalid = validateBlockPayload(blocks)
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown block type: ${invalid.join(', ')}` }, { status: 400 })
  }

  const result = await saveEventBlocks(params.id, blocks)
  await logEventEvent(params.id, 'BLOCKS', `BLOCKS SAVED ON THE WORKER APP — ${result.saved.length} BLOCK(S)`)

  return NextResponse.json(result)
}
