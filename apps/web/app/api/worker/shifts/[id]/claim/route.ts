import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { claimOpenShift } from '@/lib/open-shifts.server'

// Claim a listed shift. Creates a PENDING claim for a manager to review.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { note?: string | null } | null

  const result = await claimOpenShift({
    venueId: session.venueId,
    staffId: session.staffId,
    openShiftId: params.id,
    note: body?.note ?? null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ claimId: result.claimId, status: 'PENDING' })
}
