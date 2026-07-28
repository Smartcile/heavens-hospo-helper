import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const checklists = await prisma.checklist.findMany({
    where: { venueId: session.venueId, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      tasks: {
        include: { task: { select: { id: true, title: true, isActive: true, version: true } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  const result = checklists.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    venueId: c.venueId,
    departmentId: c.departmentId,
    sectionId: c.sectionId,
    appearFromTime: c.appearFromTime,
    department: c.department,
    section: c.section,
    tasks: c.tasks.map((ct) => ({
      id: ct.task.id,
      title: ct.task.title,
      isActive: ct.task.isActive,
      version: ct.task.version,
    })),
  }))

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, description, departmentId, sectionId, appearFromTime, taskIds } = body

  if (!name?.trim()) return NextResponse.json({ error: 'NAME IS REQUIRED' }, { status: 400 })
  if (!taskIds?.length) return NextResponse.json({ error: 'ADD AT LEAST ONE TASK' }, { status: 400 })

  const checklist = await prisma.checklist.create({
    data: {
      name: name.toUpperCase().trim(),
      description: description?.trim() || null,
      venueId: session.venueId,
      departmentId: departmentId || null,
      sectionId: sectionId || null,
      appearFromTime: appearFromTime || null,
      tasks: { create: taskIds.map((taskId: string, i: number) => ({ taskId, sortOrder: i })) },
    },
  })

  return NextResponse.json(checklist, { status: 201 })
}
