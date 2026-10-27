import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { normaliseOutcomes } from '@/lib/task-outcomes'
import { workerTaskAccess } from '@/lib/worker-task-access.server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canEditList) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.checklist.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, departmentId, sectionId, appearFromTime, taskIds, allowedOutcomes, requireOutcomeReason } = body

  let ids: string[] | undefined
  if (taskIds !== undefined) {
    const rawIds: string[] = Array.isArray(taskIds) ? taskIds : []
    ids = [...new Set<string>(rawIds)]
    if (ids.length !== rawIds.length) {
      return NextResponse.json({ error: 'DUPLICATE TASKS IN THIS LIST' }, { status: 400 })
    }
    const venueTaskCount = await prisma.task.count({
      where: { id: { in: ids }, venueId: session.venueId, deletedAt: null },
    })
    if (venueTaskCount !== ids.length) {
      return NextResponse.json({ error: 'ONE OR MORE TASKS ARE NOT IN THIS VENUE' }, { status: 400 })
    }
  }

  const checklist = await prisma.checklist.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.toUpperCase().trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
      ...(departmentId !== undefined && { departmentId: departmentId || null }),
      ...(sectionId !== undefined && { sectionId: sectionId || null }),
      ...(appearFromTime !== undefined && { appearFromTime: appearFromTime || null }),
      ...(allowedOutcomes !== undefined && { allowedOutcomes: normaliseOutcomes(allowedOutcomes) }),
      ...(requireOutcomeReason !== undefined && { requireOutcomeReason: !!requireOutcomeReason }),
      ...(ids !== undefined && {
        tasks: {
          deleteMany: {},
          create: ids.map((taskId, i) => ({ taskId, sortOrder: i })),
        },
      }),
    },
  })

  return NextResponse.json(checklist)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canDeleteList) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.checklist.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.checklist.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
