import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

// Clear a stale PARTIAL / in-progress row. `TaskProgress` is one shared row per
// task and is normally removed the moment a terminal outcome is recorded; this
// is the admin escape hatch for a row left behind (e.g. staff turnover).
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.edit')
  if (denied) return denied

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!task || task.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && task.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.taskProgress.deleteMany({ where: { taskId: params.id } })
  return NextResponse.json({ success: true })
}
