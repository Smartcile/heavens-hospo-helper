import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function POST(req: Request) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { title, description, dueDate, rolloverEnabled, completionType } = body

  if (!title?.trim()) return NextResponse.json({ error: 'TITLE IS REQUIRED' }, { status: 400 })

  const task = await prisma.task.create({
    data: {
      title: title.toUpperCase().trim(),
      description: description?.trim() || null,
      venueId: session.venueId,
      departmentId: session.departmentId,
      completionType: completionType || 'TICK_PHOTO',
      scheduleType: 'DAILY',
      scheduleDays: [],
      isOneOff: true,
      dueDate: dueDate ? new Date(dueDate) : null,
      rolloverEnabled: !!rolloverEnabled,
      isActive: true,
    },
  })

  // Auto-add to SIDE WORK checklist if one exists for this venue/department
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
  }

  return NextResponse.json({ task, addedToList: !!sideWorkList }, { status: 201 })
}
