import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.task.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, description, departmentId, sectionId, completionType,
    scheduleType, scheduleDays, customCron, intervalMonths,
    monthlyOption, monthlyDay, isActive, requiredTrainingIds,
    requireRetrain, changeSummary,
  } = body

  let resolvedDeptId = departmentId !== undefined ? (departmentId || null) : undefined
  const resolvedSectionId = sectionId !== undefined ? (sectionId || null) : undefined
  if (sectionId && !departmentId) {
    const s = await prisma.section.findUnique({ where: { id: sectionId }, select: { departmentId: true } })
    if (s) resolvedDeptId = s.departmentId
  }

  const update: Record<string, unknown> = {}
  if (title !== undefined) update.title = title.toUpperCase().trim()
  if (description !== undefined) update.description = description?.trim() || null
  if (resolvedDeptId !== undefined) update.departmentId = resolvedDeptId
  if (resolvedSectionId !== undefined) update.sectionId = resolvedSectionId
  if (completionType !== undefined) update.completionType = completionType
  if (scheduleType !== undefined) {
    update.scheduleType = scheduleType
    update.scheduleDays = scheduleType === 'DAILY' ? [] : scheduleDays || []
    update.customCron = scheduleType === 'CUSTOM' ? customCron : null
    update.intervalMonths = scheduleType === 'MONTHLY' ? Math.max(1, intervalMonths || 1) : 1
  } else {
    if (scheduleDays !== undefined) update.scheduleDays = scheduleDays
    if (customCron !== undefined) update.customCron = customCron
    if (intervalMonths !== undefined) update.intervalMonths = Math.max(1, intervalMonths)
  }
  if (isActive !== undefined) update.isActive = isActive
  if (monthlyOption !== undefined) update.monthlyOption = scheduleType === 'MONTHLY' ? monthlyOption : null
  if (monthlyDay !== undefined) update.monthlyDay = scheduleType === 'MONTHLY' && monthlyOption === 'SPECIFIC_DAY' ? monthlyDay : null

  if (requireRetrain) {
    update.version = existing.version + 1
    try {
      const { postRetrainNotice } = await import('@/lib/retrain')
      await postRetrainNotice({
        venueId: existing.venueId,
        departmentId: existing.departmentId,
        title: existing.title,
        summary: changeSummary,
        createdById: session.staffId,
      })
    } catch { /* best-effort */ }
  }

  const task = await prisma.task.update({ where: { id: params.id }, data: update })

  if (requiredTrainingIds !== undefined) {
    await prisma.taskRequiredTraining.deleteMany({ where: { taskId: task.id } })
    if (requiredTrainingIds.length) {
      await prisma.taskRequiredTraining.createMany({
        data: requiredTrainingIds.map((moduleId: string) => ({ taskId: task.id, moduleId })),
      })
    }
  }

  return NextResponse.json(task)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'ADMIN' && session.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.task.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.task.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
