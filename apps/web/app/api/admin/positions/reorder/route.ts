import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { canAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'

// Reorder the position groups shown in the staff grids (Availability, Roster,
// Clocks, Payroll). The order lives on `Position.sortOrder`, so it sticks
// everywhere positions are listed. Any manager who owns one of those views may
// drag the groups.
const REORDER_GRANTS = [
  'training.playbook.edit',
  'team.roster.edit',
  'team.availability.edit',
  'team.clocks.approve',
  'team.clocks.manual',
  'team.payroll.close',
]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const grants = await Promise.all(REORDER_GRANTS.map((key) => canAccess(session, req, key)))
  if (!grants.some(Boolean)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { venueId?: string; order?: unknown } | null
  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const order = Array.isArray(body?.order)
    ? body!.order.filter((x): x is string => typeof x === 'string')
    : []
  if (order.length === 0) return NextResponse.json({ error: 'order is required' }, { status: 400 })

  // Only positions actually owned by the venue are touched.
  const owned = await prisma.position.findMany({
    where: { id: { in: order }, venueId, deletedAt: null },
    select: { id: true },
  })
  const ownedSet = new Set(owned.map((p) => p.id))

  const updates = order
    .map((id, index) => ({ id, index }))
    .filter((x) => ownedSet.has(x.id))
    .map((x) => prisma.position.update({ where: { id: x.id }, data: { sortOrder: x.index } }))

  if (updates.length > 0) await prisma.$transaction(updates)
  return NextResponse.json({ success: true })
}
