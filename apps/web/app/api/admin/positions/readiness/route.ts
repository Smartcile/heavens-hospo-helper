import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { readinessSummaries } from '@/lib/position-requirements.server'

// { positionId: { total, ready } } for the roles-list readiness badges.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId')
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  return NextResponse.json(await readinessSummaries(venueId))
}
