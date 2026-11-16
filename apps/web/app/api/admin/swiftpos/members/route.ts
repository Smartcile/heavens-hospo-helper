import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { normaliseSwiftPosMapping } from '@/lib/customer-groups'
import { customerGroupInclude, customerGroupView } from '@/lib/customer-groups.server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const groups = await prisma.customerGroup.findMany({
    where: { venueId: scoped.venueId, deletedAt: null },
    include: customerGroupInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ groups: groups.map(customerGroupView) })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!body.groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 422 })

  const group = await prisma.customerGroup.findFirst({
    where: { id: String(body.groupId), venueId: scoped.venueId, deletedAt: null },
  })
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const mapping = normaliseSwiftPosMapping(body)
  const updated = await prisma.customerGroup.update({
    where: { id: group.id },
    data: {
      swiftPosTypeActive: mapping.typeActive,
      swiftPosStatusActive: mapping.statusActive,
      swiftPosTypeRemoved: mapping.typeRemoved,
      swiftPosStatusRemoved: mapping.statusRemoved,
      exportEncoding: mapping.exportEncoding,
    },
    include: customerGroupInclude,
  })
  return NextResponse.json({ group: customerGroupView(updated) })
}
