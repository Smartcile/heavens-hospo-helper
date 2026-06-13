import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.shiftNote.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.content !== undefined) updates.content = String(body.content).trim()
  if (body.category !== undefined) updates.category = String(body.category).toUpperCase().trim()
  if (body.resolved !== undefined) updates.resolvedAt = body.resolved ? new Date() : null

  const note = await prisma.shiftNote.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(note)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.shiftNote.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })
  return NextResponse.json({ success: true })
}
