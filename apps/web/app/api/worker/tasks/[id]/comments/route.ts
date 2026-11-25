import { NextRequest, NextResponse } from 'next/server'
import type { WorkerSession } from '@hospo-ops/types'
import { getWorkerSession } from '@/lib/worker-session'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import type { WorkerTaskAccess } from '@/lib/worker-task-access'
import {
  addTaskComment,
  listTaskComments,
  loadWorkerThreadTask,
  softDeleteTaskComment,
  validateTaskCommentInput,
  workerCanSignOff,
  type ThreadTask,
} from '@/lib/task-comments.server'

interface Params {
  params: { id: string }
}

async function loadTask(
  id: string,
): Promise<{ error: NextResponse } | { session: WorkerSession; task: ThreadTask; access: WorkerTaskAccess }> {
  const session = await getWorkerSession()
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const task = await loadWorkerThreadTask(session, id)
  if (!task) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const access = await workerTaskAccess(session)
  return { session, task, access }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const loaded = await loadTask(params.id)
  if ('error' in loaded) return loaded.error
  const { session, task, access } = loaded

  const canDeleteAny = access.canEditTask
  return NextResponse.json({
    comments: await listTaskComments(task.id, { viewerStaffId: session.staffId, canDeleteAny }),
    canAdd: task.isThread && !task.threadClosedAt,
    canDeleteAny,
    canSignOff: workerCanSignOff(session, task, access.canEditTask),
    isThread: task.isThread,
    threadClosedAt: task.threadClosedAt,
    threadClosedById: task.threadClosedById,
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const loaded = await loadTask(params.id)
  if ('error' in loaded) return loaded.error
  const { session, task } = loaded
  if (!task.isThread) return NextResponse.json({ error: 'THIS TASK IS NOT A THREAD' }, { status: 409 })
  if (task.threadClosedAt) return NextResponse.json({ error: 'THREAD IS CLOSED' }, { status: 409 })

  const body = (await req.json().catch(() => null)) as { body?: unknown; imageUrls?: unknown } | null
  // Commenting deliberately does NOT require `execution.tasks.edit`: anyone who
  // can already see the task must be able to reply.
  const validated = validateTaskCommentInput({ body: body?.body, imageUrls: body?.imageUrls })
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const comment = await addTaskComment({
    taskId: task.id,
    staffId: session.staffId,
    body: validated.body,
    imageUrls: validated.imageUrls,
  })
  return NextResponse.json({ comment }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const loaded = await loadTask(params.id)
  if ('error' in loaded) return loaded.error
  const { session, task, access } = loaded

  const body = (await req.json().catch(() => null)) as { id?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const result = await softDeleteTaskComment({
    taskId: task.id,
    commentId: body.id,
    viewerStaffId: session.staffId,
    canDeleteAny: access.canEditTask,
  })
  if (result === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (result === 'forbidden') return NextResponse.json({ error: 'YOU CAN ONLY DELETE YOUR OWN COMMENTS' }, { status: 403 })
  return NextResponse.json({ success: true })
}
