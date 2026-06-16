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

  const existing = await prisma.section.findUnique({ where: { id: params.id }, select: { venueId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).toUpperCase().trim()
  if (body.colour !== undefined) updates.colour = body.colour?.trim() || null
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder) || 0
  if (body.isActive !== undefined) updates.isActive = !!body.isActive

  const section = await prisma.section.update({
    where: { id: params.id },
    data: updates,
    include: { department: { select: { id: true, name: true, colour: true } } },
  })
  return NextResponse.json(section)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.section.findUnique({ where: { id: params.id }, select: { venueId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.section.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })
  // Detach tasks from the deleted section (keep the tasks themselves).
  await prisma.task.updateMany({ where: { sectionId: params.id }, data: { sectionId: null } })

  return NextResponse.json({ success: true })
}
