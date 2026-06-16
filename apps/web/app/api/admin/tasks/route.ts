import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const departmentId = searchParams.get('departmentId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, colour: true } },
      section: { select: { id: true, name: true } },
      requiredTraining: { select: { moduleId: true } },
    },
    orderBy: [{ departmentId: 'asc' }, { sortOrder: 'asc' }],
  })

  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    title,
    description,
    venueId,
    departmentId,
    sectionId,
    assignedToStaffId,
    completionType,
    scheduleType,
    scheduleDays,
    customCron,
    requiredTrainingIds,
  } = body

  if (!title?.trim() || !venueId) {
    return NextResponse.json({ error: 'Title and venueId are required' }, { status: 400 })
  }

  // A section implies its department — keep them consistent.
  let finalDepartmentId: string | null = departmentId ?? null
  if (sectionId) {
    const section = await prisma.section.findFirst({ where: { id: sectionId, deletedAt: null }, select: { departmentId: true } })
    if (section) finalDepartmentId = section.departmentId
  }

  const maxSort = await prisma.task.findFirst({
    where: { venueId, departmentId: finalDepartmentId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })

  const reqIds: string[] = Array.isArray(requiredTrainingIds) ? requiredTrainingIds : []

  const task = await prisma.task.create({
    data: {
      title: String(title).toUpperCase().trim(),
      description: description?.trim() ?? null,
      venueId,
      departmentId: finalDepartmentId,
      sectionId: sectionId || null,
      assignedToStaffId: assignedToStaffId ?? null,
      completionType: completionType ?? 'TICK',
      scheduleType: scheduleType ?? 'DAILY',
      scheduleDays: scheduleDays ?? [],
      customCron: customCron ?? null,
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      requiredTraining: { create: reqIds.map((moduleId) => ({ moduleId })) },
    },
  })

  return NextResponse.json(task, { status: 201 })
}
