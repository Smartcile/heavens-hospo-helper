import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { withdrawOpenShiftClaim } from '@/lib/open-shifts.server'

// Withdraw your own pending claim on a listed shift.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await withdrawOpenShiftClaim(params.id, session.staffId)
  if (!ok) return NextResponse.json({ error: 'CLAIM ALREADY RESOLVED' }, { status: 409 })
  return NextResponse.json({ success: true })
}
