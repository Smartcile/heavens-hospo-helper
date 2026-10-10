import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { trainingStatusForVenue } from '@/lib/training-status.server'

// Staff training status for the STATUS tab: on-shift staff first, traffic-light
// level per person. Computation lives in lib/training-status.server.ts (also
// used by the dashboard TRAINING widget).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId') || session.user.venueId

  const status = await trainingStatusForVenue(venueId)
  if (!status) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  return NextResponse.json(status)
}
