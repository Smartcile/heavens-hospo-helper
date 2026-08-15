import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { postRetrainNotice } from '@/lib/retrain'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'execution.tasks.view')
  if (denied) return denied

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true, title: true, description: true, venueId: true, departmentId: true, sectionId: true,
      assignedToStaffId: true,
      completionType: true, scheduleType: true, scheduleDays: true, customCron: true,
      intervalMonths: true, monthlyOption: true, monthlyDay: true, isActive: true,
      status: true, hsCategory: true, linkedItemId: true,
      readingUnit: true, readingMin: true, readingMax: true, criticalMin: true, criticalMax: true,
      requiredTraining: { select: { moduleId: true } },
      taskGuides: { select: { guideId: true, isRequiredForCompetency: true } },
    },
  })
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(task)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.edit')
  if (denied) return denied

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) updates.title = String(body.title).toUpperCase().trim()
  if (body.description !== undefined) updates.description = body.description?.trim() ?? null
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId ?? null
  if (body.assignedToStaffId !== undefined) updates.assignedToStaffId = body.assignedToStaffId ?? null
  if (body.completionType !== undefined) updates.completionType = body.completionType
  if (body.scheduleType !== undefined) updates.scheduleType = body.scheduleType
  if (body.scheduleDays !== undefined) updates.scheduleDays = body.scheduleDays
  if (body.customCron !== undefined) updates.customCron = body.customCron ?? null
  if (body.intervalMonths !== undefined) updates.intervalMonths = Math.max(1, Number(body.intervalMonths) || 1)
  if (body.monthlyOption !== undefined) updates.monthlyOption = body.monthlyOption || null
  if (body.monthlyDay !== undefined) updates.monthlyDay = body.monthlyDay != null ? (Number(body.monthlyDay) || 1) : null
  if (body.isActive !== undefined) updates.isActive = body.isActive
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder
  // --- Food Health & Safety fields ---
  if (body.status !== undefined) updates.status = body.status
  if (body.hsCategory !== undefined) updates.hsCategory = body.hsCategory ?? null
  if (body.linkedItemId !== undefined) updates.linkedItemId = body.linkedItemId || null
  if (body.readingUnit !== undefined) updates.readingUnit = body.readingUnit ?? null
  if (body.readingMin !== undefined) updates.readingMin = body.readingMin != null && Number.isFinite(body.readingMin) ? Number(body.readingMin) : null
  if (body.readingMax !== undefined) updates.readingMax = body.readingMax != null && Number.isFinite(body.readingMax) ? Number(body.readingMax) : null
  if (body.criticalMin !== undefined) updates.criticalMin = body.criticalMin != null && Number.isFinite(body.criticalMin) ? Number(body.criticalMin) : null
  if (body.criticalMax !== undefined) updates.criticalMax = body.criticalMax != null && Number.isFinite(body.criticalMax) ? Number(body.criticalMax) : null

  // Section implies its department.
  if (body.sectionId !== undefined) {
    updates.sectionId = body.sectionId || null
    if (body.sectionId) {
      const section = await prisma.section.findFirst({ where: { id: body.sectionId, deletedAt: null }, select: { departmentId: true } })
      if (section) updates.departmentId = section.departmentId
    }
  }
  if (body.requiredTrainingIds !== undefined) {
    const reqIds: string[] = Array.isArray(body.requiredTrainingIds) ? body.requiredTrainingIds : []
    updates.requiredTraining = { deleteMany: {}, create: reqIds.map((moduleId: string) => ({ moduleId })) }

    // Sync linkedTaskId back to the training modules (bidirectional link)
    await prisma.trainingModule.updateMany({
      where: { linkedTaskId: params.id, id: { notIn: reqIds } },
      data: { linkedTaskId: null },
    })
    if (reqIds.length > 0) {
      await prisma.trainingModule.updateMany({
        where: { id: { in: reqIds } },
        data: { linkedTaskId: params.id },
      })
    }
  }
  if (body.competencyGuideIds !== undefined) {
    const guideIds: string[] = Array.isArray(body.competencyGuideIds) ? body.competencyGuideIds : []
    // Remove old competency TaskGuide rows, then create new ones
    await prisma.taskGuide.deleteMany({
      where: { taskId: params.id, isRequiredForCompetency: true },
    })
    if (guideIds.length > 0) {
      await prisma.taskGuide.createMany({
        data: guideIds.map((guideId: string) => ({ taskId: params.id, guideId, isRequiredForCompetency: true })),
      })
    }
  }

  // "Significant change" → bump version + post a re-train notice to the group.
  const requireRetrain = !!body.requireRetrain
  if (requireRetrain) updates.version = { increment: 1 }

  const task = await prisma.task.update({
    where: { id: params.id },
    data: updates,
  })

  if (requireRetrain) {
    try {
      await postRetrainNotice({
        venueId: task.venueId,
        departmentId: task.departmentId,
        title: task.title,
        summary: body.changeSummary ?? null,
        createdById: session.user.id,
      })
    } catch { /* never block the save */ }
  }

  return NextResponse.json(task)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'execution.tasks.delete')
  if (denied) return denied

  await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
