import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { bulkMemberships, type MembershipBulkAction } from '@/lib/customer-memberships.server'

const ACTIONS: MembershipBulkAction[] = ['ACTIVATE', 'DEACTIVATE', 'ARCHIVE']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const action = String(body.action ?? '').toUpperCase() as MembershipBulkAction
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'INVALID ACTION' }, { status: 422 })
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'SELECT AT LEAST ONE MEMBER' }, { status: 422 })
  }

  const count = await bulkMemberships(scoped.venueId, body.ids.map(String), action)
  return NextResponse.json({ ok: true, count })
}
