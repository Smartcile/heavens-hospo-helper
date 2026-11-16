import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import {
  archiveMembership,
  membershipInclude,
  membershipView,
  updateMembership,
} from '@/lib/customer-memberships.server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const row = await prisma.customerMembership.findFirst({
    where: { id: params.id, venueId: scoped.venueId, deletedAt: null },
    include: membershipInclude,
  })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ membership: membershipView(row) })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const row = await updateMembership(scoped.venueId, params.id, body)
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ membership: membershipView(row) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'COULD NOT SAVE MEMBER' },
      { status: 422 },
    )
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const count = await archiveMembership(scoped.venueId, params.id)
  if (count !== 1) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
