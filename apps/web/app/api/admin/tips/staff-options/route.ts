import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'

/**
 * GET /api/admin/tips/staff-options?venueId=
 *
 * A narrow active-staff list for the tips editor. Deliberately guarded by
 * `performance.tips.view` so a restricted manager can build a tips period
 * without also holding `team.staff.view`.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(
    session,
    req,
    req.nextUrl.searchParams.get('venueId'),
  )
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const staff = await prisma.staff.findMany({
    where: { venueId: scoped.venueId, deletedAt: null, isActive: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      department: { select: { name: true } },
    },
  })

  return NextResponse.json(
    staff.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim().toUpperCase(),
      departmentName: s.department?.name ?? null,
    })),
  )
}
