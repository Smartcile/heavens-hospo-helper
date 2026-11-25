import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { loadWorkerThreadTask, setThreadClosed, workerCanSignOff } from '@/lib/task-comments.server'

interface Params {
  params: { id: string }
}

/**
 * Sign a task thread off (close) or reopen it from the worker app. This only
 * stamps `threadClosedAt`/`threadClosedById` — it does NOT write a TaskCompletion
 * (#145 decision 4).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const task = await loadWorkerThreadTask(session, params.id)
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!task.isThread) return NextResponse.json({ error: 'THIS TASK IS NOT A THREAD' }, { status: 409 })

  const access = await workerTaskAccess(session)
  if (!workerCanSignOff(session, task, access.canEditTask)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as { closed?: unknown } | null
  if (typeof body?.closed !== 'boolean') {
    return NextResponse.json({ error: 'closed is required' }, { status: 400 })
  }

  const updated = await setThreadClosed({ taskId: task.id, closed: body.closed, staffId: session.staffId })
  return NextResponse.json({
    closed: !!updated.threadClosedAt,
    threadClosedAt: updated.threadClosedAt,
    threadClosedById: updated.threadClosedById,
  })
}
