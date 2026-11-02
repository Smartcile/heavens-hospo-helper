import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'
import { resolveReferences } from '@/lib/beo-references.server'

/**
 * GET /api/worker/events/references?guides=a,b&tasks=c&checklists=d — resolve the
 * playbook references attached to a BEO area for the worker's venue. Gated by
 * event access so a floor manager without ops/training grants can still read them.
 */
export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!(await workerMayManageEvents(session))) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const params = new URL(req.url).searchParams
  const list = (key: string) => (params.get(key) ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const resolved = await resolveReferences(session!.venueId, {
    guideIds: list('guides'),
    taskIds: list('tasks'),
    checklistIds: list('checklists'),
  })
  return NextResponse.json(resolved)
}
