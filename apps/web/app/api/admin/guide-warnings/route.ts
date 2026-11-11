import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canAccess, guardAccess } from '@/lib/permissions'
import { guideWarningsForVenue } from '@/lib/guide-warnings.server'

// The actionable "needs attention" list that sits beside the training board.
// Read-only GET — actions reuse the existing sign-off/retrain routes.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId') || session.user.venueId

  const data = await guideWarningsForVenue(venueId)
  if (!data) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })

  const [canAssign, canSignOff] = await Promise.all([
    canAccess(session, req, 'training.playbook.assign'),
    canAccess(session, req, 'training.playbook.signoff'),
  ])

  return NextResponse.json({ ...data, canAssign, canSignOff })
}
