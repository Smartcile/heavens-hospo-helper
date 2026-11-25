import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayAccessTips } from '@/lib/worker-tips-access'

/** GET /api/worker/tips/access — managers/admins only. */
export async function GET() {
  const session = await getWorkerSession()
  return NextResponse.json({ allowed: workerMayAccessTips(session?.role) })
}
