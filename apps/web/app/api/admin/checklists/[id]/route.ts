import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { cleanNoticeAudiences } from '@/lib/notice-audience'

interface Params {
  params: { id: string }
}

// Single checklist for the reference popup (name + ordered live tasks).
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

  const c = await prisma.checklist.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      tasks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          task: {
            select: {
              id: true, title: true, completionType: true, scheduleType: true,
              isActive: true, deletedAt: true,
            },
          },
        },
      },
    },
  })
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && c.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    id: c.id,
    name: c.name,
    description: c.description,
    venueId: c.venueId,
    department: c.department,
    section: c.section,
    appearFromTime: c.appearFromTime,
    tasks: c.tasks.filter((ct) => ct.task && !ct.task.deletedAt).map((ct) => ct.task),
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.edit')
  if (denied) return denied

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
  if (body.audiences !== undefined) {
    updates.audiences = { deleteMany: {}, create: cleanNoticeAudiences(body.audiences) }
  }

  const checklist = await prisma.checklist.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(checklist)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'execution.tasks.delete')
  if (denied) return denied

  const existing = await prisma.checklist.findUnique({ where: { id: params.id }, select: { venueId: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.checklist.update({ where: { id: params.id }, data: { deletedAt: new Date(), isActive: false } })
  return NextResponse.json({ success: true })
}
