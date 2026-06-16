import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { postRetrainNotice } from '@/lib/retrain'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  if (body.isActive !== undefined) updates.isActive = body.isActive
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder

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

  await prisma.task.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
