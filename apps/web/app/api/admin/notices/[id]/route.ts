import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.notice.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = String(body.title).trim()
  if (body.body !== undefined) updates.body = String(body.body).trim()
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.pinned !== undefined) updates.pinned = !!body.pinned
  if (body.requiresAck !== undefined) updates.requiresAck = !!body.requiresAck
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.isActive !== undefined) updates.isActive = !!body.isActive
  if (body.startsAt !== undefined) updates.startsAt = body.startsAt ? new Date(body.startsAt) : null
  if (body.endsAt !== undefined) updates.endsAt = body.endsAt ? new Date(body.endsAt) : null

  const notice = await prisma.notice.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(notice)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.notice.update({ where: { id: params.id }, data: { deletedAt: new Date(), isActive: false } })
  return NextResponse.json({ success: true })
}
