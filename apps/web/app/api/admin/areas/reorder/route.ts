import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'

// Reorder the venue's areas (Venue Setup list + event roster ordering).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { venueId?: string; order?: unknown } | null
  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const order = Array.isArray(body?.order)
    ? body!.order.filter((x): x is string => typeof x === 'string')
    : []
  if (order.length === 0) return NextResponse.json({ error: 'order is required' }, { status: 400 })

  const owned = await prisma.area.findMany({
    where: { id: { in: order }, venueId, deletedAt: null },
    select: { id: true },
  })
  const ownedSet = new Set(owned.map((a) => a.id))

  const updates = order
    .map((id, index) => ({ id, index }))
    .filter((x) => ownedSet.has(x.id))
    .map((x) => prisma.area.update({ where: { id: x.id }, data: { sortOrder: x.index } }))

  if (updates.length > 0) await prisma.$transaction(updates)
  return NextResponse.json({ success: true })
}
