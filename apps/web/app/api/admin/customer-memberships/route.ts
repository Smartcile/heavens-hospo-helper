import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import {
  createMembership,
  listMemberships,
  membershipView,
} from '@/lib/customer-memberships.server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const groupId = url.searchParams.get('groupId')
  const search = url.searchParams.get('search')
  const statusParam = (url.searchParams.get('status') ?? 'all').toLowerCase()
  const status = statusParam === 'active' || statusParam === 'inactive' ? statusParam : 'all'

  const rows = await listMemberships({
    venueId: scoped.venueId,
    groupId,
    search,
    status,
  })
  return NextResponse.json({ venueId: scoped.venueId, memberships: rows.map(membershipView) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!body.groupId || !body.membershipNumber) {
    return NextResponse.json({ error: 'GROUP AND MEMBERSHIP NUMBER ARE REQUIRED' }, { status: 422 })
  }

  try {
    const row = await createMembership(scoped.venueId, {
      groupId: String(body.groupId),
      membershipNumber: String(body.membershipNumber),
      firstName: body.firstName,
      lastName: body.lastName,
      memberType: body.memberType,
      isActive: body.isActive,
      isFamily: body.isFamily,
      isPrimary: body.isPrimary,
      familySurnames: body.familySurnames,
      email: body.email,
      phone: body.phone,
      memberInterests: body.memberInterests,
      company: body.company,
      externalId: body.externalId,
    })
    return NextResponse.json({ membership: membershipView(row) }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'COULD NOT SAVE MEMBER' },
      { status: 422 },
    )
  }
}
