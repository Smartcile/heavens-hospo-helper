import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

async function loadScoped(id: string, session: { user: { role: string; venueId: string } }) {
  const view = await prisma.orderView.findFirst({ where: { id, deletedAt: null } })
  if (!view) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (session.user.role === 'MANAGER' && view.venueId !== session.user.venueId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { view }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).toUpperCase().trim()
  if (body.config !== undefined) data.config = body.config
  if (body.isShared !== undefined) data.isShared = !!body.isShared
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0

  const updated = await prisma.orderView.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session)
  if (scoped.error) return scoped.error

  await prisma.orderView.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
