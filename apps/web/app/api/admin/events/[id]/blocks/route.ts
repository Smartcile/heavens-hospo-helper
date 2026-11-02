import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import {
  type EventBlockInput,
  logEventEvent,
  saveEventBlocks,
  validateBlockPayload,
} from '@/lib/events.server'
import { loadBlockLibrary } from '@/lib/beo-block-defs.server'

type Params = { params: { id: string } }

/** PUT /api/admin/events/[id]/blocks — replace the event's blocks wholesale. */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.blocks')
  if (denied) return denied

  const scoped =
    session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}
  const event = await prisma.event.findFirst({
    where: { id: params.id, deletedAt: null, ...scoped },
    select: { id: true, venueId: true },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { blocks?: EventBlockInput[] }
  const blocks = Array.isArray(body.blocks) ? body.blocks : []

  const library = await loadBlockLibrary(event.venueId)
  const invalid = validateBlockPayload(blocks, library)
  if (invalid.length > 0) {
    return NextResponse.json({ error: `Unknown block type: ${invalid.join(', ')}` }, { status: 400 })
  }

  const result = await saveEventBlocks(params.id, blocks, library)
  await logEventEvent(
    params.id,
    'BLOCKS',
    `BLOCKS SAVED — ${result.saved.length} BLOCK(S)`,
  )

  return NextResponse.json(result)
}
