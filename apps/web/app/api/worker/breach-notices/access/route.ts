import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerBreachAccess } from '@/lib/worker-breach-access'

/** GET /api/worker/breach-notices/access — dashboard tile + form capabilities. */
export async function GET() {
  const session = await getWorkerSession()
  const access = await workerBreachAccess(session)
  return NextResponse.json(access)
}
