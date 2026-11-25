import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccess, guardAccess } from '@/lib/permissions'
import { adminCanSignOff, loadAdminThreadTask, setThreadClosed } from '@/lib/task-comments.server'

interface Params {
  params: { id: string }
}

/**
 * Sign a task thread off (close) or reopen it. This only stamps
 * `threadClosedAt`/`threadClosedById` — it does NOT write a TaskCompletion
 * (#145 decision 4).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

  const task = await loadAdminThreadTask(session, params.id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!task.isThread) return NextResponse.json({ error: 'THIS TASK IS NOT A THREAD' }, { status: 409 })

  if (!adminCanSignOff(session, await canAccess(session, req, 'execution.tasks.edit'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { closed?: unknown } | null
  if (typeof body?.closed !== 'boolean') {
    return NextResponse.json({ error: 'closed is required' }, { status: 400 })
  }

  const updated = await setThreadClosed({ taskId: task.id, closed: body.closed, staffId: session.user.id })
  return NextResponse.json({
    closed: !!updated.threadClosedAt,
    threadClosedAt: updated.threadClosedAt,
    threadClosedById: updated.threadClosedById,
  })
}
