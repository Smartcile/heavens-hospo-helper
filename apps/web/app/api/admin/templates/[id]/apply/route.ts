import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

// Apply a template to a department: bulk-create Task rows from the template's
// items. Skips items whose title already exists as an active task in that
// department, so re-applying is safe and won't create duplicates.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { departmentId } = body as { departmentId: string }

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId is required' }, { status: 400 })
  }

  const template = await prisma.taskTemplate.findUnique({
    where: { id: params.id },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!template || template.deletedAt) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!department || department.deletedAt) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }

  if (session.user.role === 'MANAGER' && department.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Existing active task titles in this department (for duplicate skipping).
  const existing = await prisma.task.findMany({
    where: { departmentId, deletedAt: null },
    select: { title: true },
  })
  const existingTitles = new Set(existing.map((t) => t.title))

  const maxSort = await prisma.task.findFirst({
    where: { venueId: department.venueId, departmentId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const toCreate = template.items.filter((item) => !existingTitles.has(item.title))
  let nextSort = (maxSort?.sortOrder ?? -1) + 1

  if (toCreate.length > 0) {
    await prisma.task.createMany({
      data: toCreate.map((item) => ({
        title: item.title,
        description: item.description,
        venueId: department.venueId,
        departmentId,
        completionType: item.completionType,
        scheduleType: item.scheduleType,
        scheduleDays: item.scheduleDays,
        sortOrder: nextSort++,
      })),
    })
  }

  return NextResponse.json({
    created: toCreate.length,
    skipped: template.items.length - toCreate.length,
  })
}
