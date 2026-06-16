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

  const existing = await prisma.checklist.findUnique({ where: { id: params.id }, select: { venueId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = String(body.name).toUpperCase().trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.sectionId !== undefined) updates.sectionId = body.sectionId || null
  if (body.appearFromTime !== undefined) updates.appearFromTime = body.appearFromTime?.trim() || null
  if (body.isActive !== undefined) updates.isActive = !!body.isActive
  if (body.taskIds !== undefined) {
    const ids: string[] = Array.isArray(body.taskIds) ? body.taskIds : []
    updates.tasks = { deleteMany: {}, create: ids.map((taskId: string, i: number) => ({ taskId, sortOrder: i })) }
  }

  const checklist = await prisma.checklist.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(checklist)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.checklist.findUnique({ where: { id: params.id }, select: { venueId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.checklist.update({ where: { id: params.id }, data: { deletedAt: new Date(), isActive: false } })
  return NextResponse.json({ success: true })
}
