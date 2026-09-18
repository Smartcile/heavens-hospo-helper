import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { BEO_REQUEST_STATUS_VALUES, logEventEvent } from '@/lib/events.server'

type Params = { params: { id: string } }

/** PATCH /api/admin/event-requests/[id] — accept or decline a customer request. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.requests')
  if (denied) return denied

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const status = String(body.status ?? '')
  if (!(BEO_REQUEST_STATUS_VALUES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
  }

  const existing = await prisma.beoChangeRequest.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      event: {
        deletedAt: null,
        ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
      },
    },
    select: { id: true, eventId: true, kind: true, status: true, requestedByName: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const responseNote = String(body.responseNote ?? '').trim() || null

  const request = await prisma.beoChangeRequest.update({
    where: { id: params.id },
    data: {
      status: status as (typeof BEO_REQUEST_STATUS_VALUES)[number],
      responseNote,
      resolvedById: session.user.id,
      resolvedAt: new Date(),
    },
  })

  // An accepted approval / sign-off is the customer accepting the BEO.
  if (status === 'ACCEPTED' && existing.kind !== 'EDIT') {
    await prisma.event.update({
      where: { id: existing.eventId },
      data: {
        customerApprovedAt: new Date(),
        customerApprovedByName: existing.requestedByName ?? null,
      } as Prisma.EventUncheckedUpdateInput,
    })
  }

  await logEventEvent(
    existing.eventId,
    'REQUEST',
    `${existing.kind} REQUEST ${status}${responseNote ? ` — ${responseNote}` : ''}`,
  )

  return NextResponse.json(request)
}
