import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { sanitiseRichText } from '@/lib/rich-text'
import { parseDueDate } from '@/lib/custom-tasks'
import { validateWorkerTaskRefs } from '@/lib/worker-task-refs.server'

export async function POST(req: Request) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    title, description, dueDate, rolloverEnabled, completionType,
    assignedToStaffId, departmentId, sectionId,
  } = body

  if (!title?.trim()) return NextResponse.json({ error: 'TITLE IS REQUIRED' }, { status: 400 })

  const due = parseDueDate(dueDate)
  if (!due.ok) return NextResponse.json({ error: 'INVALID DUE DATE' }, { status: 400 })

  // Every ref must belong to the worker's venue. Quick tasks stay grant-free,
  // but a granted worker (or a crafted request) must not write another venue's
  // department/section.
  const refError = await validateWorkerTaskRefs({
    venueId: session.venueId,
    departmentId,
    sectionId,
  })
  if (refError) return NextResponse.json({ error: refError }, { status: 400 })

  if (assignedToStaffId) {
    const assignee = await prisma.staff.count({
      where: { id: assignedToStaffId, venueId: session.venueId, deletedAt: null },
    })
    if (assignee !== 1) {
      return NextResponse.json({ error: 'ASSIGNEE IS NOT IN THIS VENUE' }, { status: 400 })
    }
  }

  // A section always implies its department (same rule as the admin POST), so a
  // mismatched department/section pair can never persist.
  let resolvedDeptId: string | null = departmentId || session.departmentId
  const resolvedSectionId: string | null = sectionId || null
  if (sectionId) {
    const s = await prisma.section.findUnique({ where: { id: sectionId }, select: { departmentId: true } })
    if (s) resolvedDeptId = s.departmentId
  }

  const task = await prisma.task.create({
    data: {
      title: title.toUpperCase().trim(),
      description: description ? (sanitiseRichText(String(description)) || null) : null,
      venueId: session.venueId,
      departmentId: resolvedDeptId,
      sectionId: resolvedSectionId,
      assignedToStaffId: assignedToStaffId || null,
      completionType: completionType || 'TICK_PHOTO',
      scheduleType: 'DAILY',
      scheduleDays: [],
      isOneOff: true,
      dueDate: due.value,
      rolloverEnabled: !!rolloverEnabled,
      isActive: true,
    },
  })

  // Auto-add to SIDE WORK only for UNASSIGNED quick tasks. An assigned custom
  // task belongs in the derived CUSTOM TASKS group, not a shared list.
  let addedToList = false
  if (!assignedToStaffId) {
    const sideWorkList = await prisma.checklist.findFirst({
      where: {
        venueId: session.venueId,
        name: { contains: 'SIDE WORK', mode: 'insensitive' },
        deletedAt: null,
      },
    })

    if (sideWorkList) {
      const maxSort = await prisma.checklistTask.findFirst({
        where: { checklistId: sideWorkList.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      await prisma.checklistTask.create({
        data: {
          checklistId: sideWorkList.id,
          taskId: task.id,
          sortOrder: (maxSort?.sortOrder ?? -1) + 1,
        },
      })
      addedToList = true
    }
  }

  return NextResponse.json({ task, addedToList }, { status: 201 })
}
