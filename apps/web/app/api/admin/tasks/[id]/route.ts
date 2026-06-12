import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

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

  const task = await prisma.task.update({
    where: { id: params.id },
    data: updates,
  })

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
