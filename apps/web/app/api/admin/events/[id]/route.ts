import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { buildEventData, eventInclude, logEventEvent } from '@/lib/events.server'

type Params = { params: { id: string } }

function scope(session: { user: { role: string; venueId: string } }) {
  return session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}
}

/** GET /api/admin/events/[id] — one event with blocks and change requests. */
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.view')
  if (denied) return denied

  const event = await prisma.event.findFirst({
    where: { id: params.id, deletedAt: null, ...scope(session) },
    include: {
      ...eventInclude,
      changeRequests: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
      },
    },
  })
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(event)
}

/** PUT /api/admin/events/[id] — partial update. */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.edit')
  if (denied) return denied

  const existing = await prisma.event.findFirst({
    where: { id: params.id, deletedAt: null, ...scope(session) },
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

/** DELETE /api/admin/events/[id] — soft delete. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.events.delete')
  if (denied) return denied

  const existing = await prisma.event.findFirst({
    where: { id: params.id, deletedAt: null, ...scope(session) },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.event.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
