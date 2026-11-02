import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

/**
 * Venue-scoped floor plan setups, for pickers (Services → TABLE PLAN).
 * Lightweight on purpose: id + name + plan only, no items.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'floorplans.plans.view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const venueId =
    session.user.role === 'MANAGER' ? session.user.venueId : searchParams.get('venueId')

  if (!venueId) return NextResponse.json({ error: 'venueId required' }, { status: 400 })

  const setups = await prisma.floorPlanSetup.findMany({
    where: { deletedAt: null, floorPlan: { venueId, deletedAt: null } },
    select: { id: true, name: true, floorPlan: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ floorPlan: { isDefault: 'desc' } }, { floorPlan: { name: 'asc' } }, { name: 'asc' }],
  })

  return NextResponse.json(setups)
}
