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

  // Resolve linked department IDs — when filtering by a department, also show
  // tasks from departments linked TO it.
  let departmentIds: string[] | undefined
  if (departmentId) {
    const links = await prisma.departmentLink.findMany({
      where: { fromDepartmentId: departmentId },
      select: { toDepartmentId: true },
    })
    departmentIds = [departmentId, ...links.map((l) => l.toDepartmentId)]
  }

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(departmentIds ? { departmentId: { in: departmentIds } } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      department: { select: { id: true, name: true, colour: true } },
      section: { select: { id: true, name: true } },
      requiredTraining: { select: { moduleId: true, module: { select: { kind: true } } } },
      taskGuides: { select: { guideId: true, isRequiredForCompetency: true } },
      trainingModules: { select: { kind: true } }, // modules whose how-to is this task
      _count: { select: { checklistLinks: true } },
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
    intervalMonths,
    monthlyOption,
    monthlyDay,
    requiredTrainingIds,
    competencyGuideIds,
    status,
    hsCategory,
    linkedItemId,
    readingUnit,
    readingMin,
    readingMax,
    criticalMin,
    criticalMax,
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
      intervalMonths: Math.max(1, Number(intervalMonths) || 1),
      monthlyOption: scheduleType === 'MONTHLY' ? (monthlyOption ?? 'FIRST_DAY') : null,
      monthlyDay: scheduleType === 'MONTHLY' && monthlyOption === 'SPECIFIC_DAY' ? (Number(monthlyDay) || 1) : null,
      sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      status: status ?? 'ACTIVE',
      hsCategory: hsCategory ?? null,
      linkedItemId: linkedItemId || null,
      readingUnit: readingUnit ?? null,
      readingMin: readingMin != null && Number.isFinite(readingMin) ? Number(readingMin) : null,
      readingMax: readingMax != null && Number.isFinite(readingMax) ? Number(readingMax) : null,
      criticalMin: criticalMin != null && Number.isFinite(criticalMin) ? Number(criticalMin) : null,
      criticalMax: criticalMax != null && Number.isFinite(criticalMax) ? Number(criticalMax) : null,
      requiredTraining: { create: reqIds.map((moduleId) => ({ moduleId })) },
      taskGuides: Array.isArray(competencyGuideIds) && competencyGuideIds.length
        ? { create: competencyGuideIds.map((guideId: string) => ({ guideId, isRequiredForCompetency: true })) }
        : undefined,
    },
  })

  if (reqIds.length > 0) {
    await prisma.trainingModule.updateMany({
      where: { id: { in: reqIds } },
      data: { linkedTaskId: task.id },
    })
  }

  return NextResponse.json(task, { status: 201 })
}
