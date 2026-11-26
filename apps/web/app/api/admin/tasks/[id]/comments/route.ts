import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import type { Session } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccess, guardAccess } from '@/lib/permissions'
import {
  addTaskComment,
  adminCanSignOff,
  listTaskComments,
  loadAdminThreadTask,
  softDeleteTaskComment,
  validateTaskCommentInput,
  type ThreadTask,
} from '@/lib/task-comments.server'

interface Params {
  params: { id: string }
}

async function loadTask(
  req: NextRequest,
  id: string,
): Promise<{ error: NextResponse } | { session: Session; task: ThreadTask }> {
  const session = await getServerSession(authOptions)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return { error: denied }
  const task = await loadAdminThreadTask(session, id)
  if (!task) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { session, task }
}

export async function GET(req: NextRequest, { params }: Params) {
  const loaded = await loadTask(req, params.id)
  if ('error' in loaded) return loaded.error
  const { session, task } = loaded

  const canSignOff = adminCanSignOff(session, await canAccess(session, req, 'execution.tasks.edit'))
  return NextResponse.json({
    comments: await listTaskComments(task.id, { viewerStaffId: session.user.id, canDeleteAny: true }),
    canAdd: task.isThread && !task.threadClosedAt,
    canDeleteAny: true,
    canSignOff,
    isThread: task.isThread,
    threadClosedAt: task.threadClosedAt,
    threadClosedById: task.threadClosedById,
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const loaded = await loadTask(req, params.id)
  if ('error' in loaded) return loaded.error
  const { session, task } = loaded
  if (!task.isThread) return NextResponse.json({ error: 'THIS TASK IS NOT A THREAD' }, { status: 409 })
  if (task.threadClosedAt) return NextResponse.json({ error: 'THREAD IS CLOSED' }, { status: 409 })

  const body = (await req.json().catch(() => null)) as { body?: unknown; imageUrls?: unknown } | null
  const validated = validateTaskCommentInput({ body: body?.body, imageUrls: body?.imageUrls })
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

  const comment = await addTaskComment({
    taskId: task.id,
    staffId: session.user.id,
    body: validated.body,
    imageUrls: validated.imageUrls,
  })
  return NextResponse.json({ comment }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const loaded = await loadTask(req, params.id)
  if ('error' in loaded) return loaded.error
  const { session, task } = loaded

  const body = (await req.json().catch(() => null)) as { id?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const result = await softDeleteTaskComment({
    taskId: task.id,
    commentId: body.id,
    viewerStaffId: session.user.id,
    canDeleteAny: true,
  })
  if (result === 'not_found') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (result === 'forbidden') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json({ success: true })
}
