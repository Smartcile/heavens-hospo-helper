import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// A checklist is an ordered set of references to LIVE tasks. Reads return the
// current task data, so edits to a task show up here automatically.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const checklists = await prisma.checklist.findMany({
    where,
    include: {
      department: { select: { id: true, name: true } },
      section: { select: { id: true, name: true } },
      tasks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          task: {
            select: {
              id: true, title: true, completionType: true, scheduleType: true,
              isActive: true, version: true, deletedAt: true,
              department: { select: { name: true } },
              section: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(
    checklists.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      venueId: c.venueId,
      departmentId: c.departmentId,
      sectionId: c.sectionId,
      department: c.department,
      section: c.section,
      tasks: c.tasks
        .filter((ct) => ct.task && !ct.task.deletedAt)
        .map((ct) => ({
          id: ct.task.id,
          title: ct.task.title,
          completionType: ct.task.completionType,
          scheduleType: ct.task.scheduleType,
          isActive: ct.task.isActive,
          version: ct.task.version,
          departmentName: ct.task.department?.name ?? null,
          sectionName: ct.task.section?.name ?? null,
        })),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, description, departmentId, sectionId, taskIds } = body
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body.venueId

  if (!name?.trim() || !venueId) {
    return NextResponse.json({ error: 'Name and venue are required' }, { status: 400 })
  }

  const ids: string[] = Array.isArray(taskIds) ? taskIds : []
  const checklist = await prisma.checklist.create({
    data: {
      name: String(name).toUpperCase().trim(),
      description: description?.trim() || null,
      venueId,
      departmentId: departmentId || null,
      sectionId: sectionId || null,
      tasks: { create: ids.map((taskId, i) => ({ taskId, sortOrder: i })) },
    },
  })

  return NextResponse.json(checklist, { status: 201 })
}
