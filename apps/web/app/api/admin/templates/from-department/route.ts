import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// Snapshot a department's current active tasks into a new reusable template.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { departmentId, name, description, category } = body as {
    departmentId: string
    name: string
    description?: string
    category?: string
  }

  if (!departmentId || !name?.trim()) {
    return NextResponse.json({ error: 'departmentId and name are required' }, { status: 400 })
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, venueId: true, deletedAt: true },
  })
  if (!department || department.deletedAt) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && department.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tasks = await prisma.task.findMany({
    where: { departmentId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  })

  if (tasks.length === 0) {
    return NextResponse.json({ error: 'Department has no active tasks to snapshot' }, { status: 400 })
  }

  const template = await prisma.taskTemplate.create({
    data: {
      name: String(name).toUpperCase().trim(),
      description: description?.trim() ?? null,
      category: category ? String(category).toUpperCase().trim() : department.name,
      isBuiltIn: false,
      venueId: department.venueId,
      items: {
        create: tasks.map((t, i) => ({
          title: t.title,
          description: t.description,
          completionType: t.completionType,
          scheduleType: t.scheduleType,
          scheduleDays: t.scheduleDays,
          sortOrder: i,
        })),
      },
    },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })

  return NextResponse.json(template, { status: 201 })
}
