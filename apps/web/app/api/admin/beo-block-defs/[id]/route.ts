import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { buildCustomDefData } from '@/lib/beo-block-defs.server'

/**
 * GET    /api/admin/beo-block-defs/[id] — one custom def.
 * PUT    /api/admin/beo-block-defs/[id] — update it (the key is immutable).
 * DELETE /api/admin/beo-block-defs/[id] — soft-delete it.
 *
 * Blocks already placed on an event keep their config; the definition only
 * controls how they render, so deleting a def leaves existing events readable
 * (their type falls back to the raw key).
 */
async function scopedDef(session: { user: { role: string; venueId: string } }, id: string) {
  return prisma.beoBlockDef.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
  })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.blocks')
  if (denied) return denied

  const def = await scopedDef(session, params.id)
  if (!def) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(def)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.blocks')
  if (denied) return denied

  const existing = await scopedDef(session, params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const { data, error } = buildCustomDefData(body, { requireKey: false })
  if (error) return NextResponse.json({ error }, { status: 400 })

  const def = await prisma.beoBlockDef.update({
    where: { id: params.id },
    data: data as Prisma.BeoBlockDefUpdateInput,
  })
  return NextResponse.json(def)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'events.blocks')
  if (denied) return denied

  const existing = await scopedDef(session, params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.beoBlockDef.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })
  return NextResponse.json({ ok: true })
}
