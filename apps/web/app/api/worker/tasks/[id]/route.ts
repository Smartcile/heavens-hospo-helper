import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { normaliseOutcomes } from '@/lib/task-outcomes'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { resolveCompetencyGuideIds } from '@/lib/task-guides'
import { validateWorkerTaskRefs } from '@/lib/worker-task-refs.server'
import { syncTaskLists } from '@/lib/task-lists.server'
import { parentLinkError, nextSubtaskOrder, hasLiveSubtasks, softDeleteTask } from '@/lib/task-subtasks.server'
import { sanitiseRichText } from '@/lib/rich-text'
import { linkedItemError } from '@/lib/task-linked-item.server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canEditTask) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.task.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    title, description, departmentId, sectionId, completionType,
    scheduleType, scheduleDays, customCron, intervalMonths,
    monthlyOption, monthlyDay, isActive, requiredTrainingIds,
    requireRetrain, changeSummary,
    allowedOutcomes, overrideOutcomes, requireOutcomeReason,
    checklistIds, assignedToStaffId, linkedItemId,
  } = body

  const guideIds = resolveCompetencyGuideIds({
    competencyGuideIds: body.competencyGuideIds,
    requiredTrainingIds,
  })

  // Venue-check every ref the granted STAFF editor can send before writing.
  const refError = await validateWorkerTaskRefs({
    venueId: session.venueId,
    departmentId: departmentId !== undefined ? departmentId || null : undefined,
    sectionId: sectionId !== undefined ? sectionId || null : undefined,
    guideIds,
  })
  if (refError) return NextResponse.json({ error: refError }, { status: 400 })

  const listIds: string[] | null = checklistIds !== undefined
    ? [...new Set(Array.isArray(checklistIds) ? (checklistIds as string[]) : [])]
    : null
  if (listIds && listIds.length) {
    const count = await prisma.checklist.count({
      where: { id: { in: listIds }, venueId: session.venueId, deletedAt: null },
    })
    if (count !== listIds.length) {
      return NextResponse.json({ error: 'ONE OR MORE LISTS ARE NOT IN THIS VENUE' }, { status: 400 })
    }
  }
  if (assignedToStaffId !== undefined) {
    if (assignedToStaffId) {
      const assignee = await prisma.staff.count({
        where: { id: assignedToStaffId, venueId: session.venueId, deletedAt: null },
      })
      if (assignee !== 1) {
        return NextResponse.json({ error: 'ASSIGNEE IS NOT IN THIS VENUE' }, { status: 400 })
      }
    }
  }
  const itemError = await linkedItemError(existing.venueId, linkedItemId, existing.linkedItemId)
  if (itemError) return NextResponse.json({ error: itemError }, { status: 400 })

  let resolvedDeptId = departmentId !== undefined ? (departmentId || null) : undefined
  const resolvedSectionId = sectionId !== undefined ? (sectionId || null) : undefined
  if (sectionId && !departmentId) {
    const s = await prisma.section.findUnique({ where: { id: sectionId }, select: { departmentId: true } })
    if (s) resolvedDeptId = s.departmentId
  }

  const update: Record<string, unknown> = {}
  if (title !== undefined) update.title = title.toUpperCase().trim()
  if (description !== undefined) {
    update.description = description ? (sanitiseRichText(String(description)) || null) : null
  }
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
  if (assignedToStaffId !== undefined) update.assignedToStaffId = assignedToStaffId || null
  if (linkedItemId !== undefined) update.linkedItemId = linkedItemId || null
  if (monthlyOption !== undefined) update.monthlyOption = scheduleType === 'MONTHLY' ? monthlyOption : null
  if (monthlyDay !== undefined) update.monthlyDay = scheduleType === 'MONTHLY' && monthlyOption === 'SPECIFIC_DAY' ? monthlyDay : null
  if (allowedOutcomes !== undefined) update.allowedOutcomes = normaliseOutcomes(allowedOutcomes)
  if (overrideOutcomes !== undefined) update.overrideOutcomes = !!overrideOutcomes
  if (requireOutcomeReason !== undefined) update.requireOutcomeReason = !!requireOutcomeReason

  // Parent link (max depth 1). Clearing a parent resets its child ordering.
  if (body.parentTaskId !== undefined) {
    const parentId = body.parentTaskId ? String(body.parentTaskId) : null
    const childHasSubtasks = parentId ? await hasLiveSubtasks(params.id) : false
    const parentError = await parentLinkError({
      parentTaskId: parentId,
      taskId: params.id,
      taskVenueId: existing.venueId,
      childHasSubtasks,
    })
    if (parentError) return NextResponse.json({ error: parentError }, { status: 400 })
    update.parentTaskId = parentId
    if (parentId && parentId !== existing.parentTaskId) {
      update.subtaskOrder = await nextSubtaskOrder(parentId)
    } else if (!parentId) {
      update.subtaskOrder = 0
    }
  }

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

  if (listIds) {
    const listError = await syncTaskLists({ taskId: params.id, venueId: existing.venueId, checklistIds: listIds })
    if (listError) return NextResponse.json({ error: listError }, { status: 400 })
  }

  // Competency links use TaskGuide (admin parity). The old `requiredTrainingIds`
  // name is accepted as an alias because the legacy worker form actually sent
  // Guide ids — never TrainingModule ids. Both map to the same junction.
  if (guideIds !== undefined) {
    await prisma.$transaction(async (tx) => {
      await tx.taskGuide.deleteMany({
        where: { taskId: task.id, isRequiredForCompetency: true },
      })
      if (guideIds.length) {
        await tx.taskGuide.createMany({
          data: guideIds.map((guideId) => ({
            taskId: task.id, guideId, isRequiredForCompetency: true,
          })),
        })
      }
    })
  }

  return NextResponse.json(task)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerTaskAccess(session)
  if (!access.canDeleteTask) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.task.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.venueId !== session.venueId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Soft-delete the task; its children are unparented and stay usable.
  await softDeleteTask(params.id)
  return NextResponse.json({ success: true })
}
