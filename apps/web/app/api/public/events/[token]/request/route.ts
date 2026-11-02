import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { eventByShareToken, logEventEvent } from '@/lib/events.server'

type Params = { params: { token: string } }

const KINDS = ['EDIT', 'APPROVAL', 'SIGN_OFF']

/**
 * POST /api/public/events/[token]/request — the customer raises an edit request
 * or approves / signs off the BEO. Creates a PENDING BeoChangeRequest for the
 * admin queue; an approval is only stamped on the event once a manager accepts
 * it (see /api/admin/event-requests/[id]).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const event = await eventByShareToken(params.token)
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : 'EDIT'
  const message = String(body.message ?? '').trim()
  if (kind === 'EDIT' && !message) {
    return NextResponse.json({ error: 'Please describe the change you need' }, { status: 400 })
  }

  const blockId = typeof body.blockId === 'string' && body.blockId ? body.blockId : null
  const requestedByName =
    String(body.requestedByName ?? '').trim() || event.contactName || event.customer?.name || null

  const created = await prisma.beoChangeRequest.create({
    data: {
      eventId: event.id,
      blockId,
      kind: kind as 'EDIT' | 'APPROVAL' | 'SIGN_OFF',
      status: 'PENDING',
      message: message || (kind === 'APPROVAL' ? 'APPROVED' : 'SIGNED OFF'),
      requestedByName,
    },
  })

  await logEventEvent(event.id, 'REQUEST', `${kind} REQUEST FROM CUSTOMER`)

  return NextResponse.json({ id: created.id, kind: created.kind, status: created.status }, { status: 201 })
}
