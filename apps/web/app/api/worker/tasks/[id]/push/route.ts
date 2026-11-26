import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { pushTaskToTomorrow, undoTaskPush } from '@/lib/task-push.server'

interface Params {
  params: { id: string }
}

// FINISH TOMORROW (#143). Hides the task until tomorrow and records the push.
// Writes no TaskCompletion — the task is deferred, not done.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let note: string | null = null
  try {
    const body = await req.json()
    note = body?.note ?? null
  } catch {
    /* an empty body is fine */
  }

  const result = await pushTaskToTomorrow({
    taskId: params.id,
    staffId: session.staffId,
    venueId: session.venueId,
    departmentId: session.departmentId,
    staffName: session.firstName ?? null,
    note,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result, { status: 201 })
}

// Undo today's push and put the task back on the floor.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await undoTaskPush({ taskId: params.id, venueId: session.venueId })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ success: true })
}
