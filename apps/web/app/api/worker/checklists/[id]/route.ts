import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.checklist.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, departmentId, sectionId, appearFromTime, taskIds } = body

  const checklist = await prisma.checklist.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.toUpperCase().trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(departmentId !== undefined && { departmentId: departmentId || null }),
      ...(sectionId !== undefined && { sectionId: sectionId || null }),
      ...(appearFromTime !== undefined && { appearFromTime: appearFromTime || null }),
      ...(taskIds !== undefined && {
        tasks: {
          deleteMany: {},
          create: taskIds.map((taskId: string, i: number) => ({ taskId, sortOrder: i })),
        },
      }),
    },
  })

  return NextResponse.json(checklist)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.checklist.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.checklist.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
