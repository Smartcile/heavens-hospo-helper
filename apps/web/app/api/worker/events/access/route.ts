import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayManageEvents } from '@/lib/worker-event-access'

/** GET /api/worker/events/access — can this worker manage events? */
export async function GET() {
  const session = await getWorkerSession()
  const allowed = await workerMayManageEvents(session)
  return NextResponse.json({ allowed })
}
