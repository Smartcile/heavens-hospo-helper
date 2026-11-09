import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { bulkNotRequiredGroup } from '@/lib/task-groups.server'

interface Params {
  params: { id: string }
}

// Bulk-settle a checklist task group as NOT_REQUIRED. Every task gets a normal
// completion row for the venue-local day, so counts, settling, reports and
// follow-ups stay consistent with settling the tasks one at a time.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const result = await bulkNotRequiredGroup({
    staffId: session.staffId,
    venueId: session.venueId,
    departmentId: session.departmentId,
    checklistId: params.id,
    groupLabel: typeof body.groupLabel === 'string' ? body.groupLabel : '',
    taskIds: Array.isArray(body.taskIds) ? body.taskIds.map(String) : null,
    note: typeof body.note === 'string' ? body.note : null,
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.skipped ? { skipped: result.skipped } : {}) },
      { status: result.status },
    )
  }

  return NextResponse.json({
    completed: result.completed,
    skipped: result.skipped,
    requiresNote: result.requiresNote,
  })
}
