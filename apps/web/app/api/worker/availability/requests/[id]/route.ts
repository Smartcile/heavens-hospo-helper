import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { withdrawEditRequest } from '@/lib/availability.server'

// Worker withdraws (cancels) their own pending edit request. The approved
// availability rows stay exactly as they are — the request just stops waiting.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await withdrawEditRequest(params.id, session.staffId)
  if (!ok) return NextResponse.json({ error: 'REQUEST ALREADY RESOLVED' }, { status: 409 })
  return NextResponse.json({ success: true })
}
