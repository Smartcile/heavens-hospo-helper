import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds } from '@/lib/venue-scope'

// Searchable "assigned to" options for the task editor. Guarded by task view
// (not team.staff.view) so a restricted manager with task access can still
// assign work without being able to open the Staff page.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

  const requested = new URL(req.url).searchParams.get('venueId')
  const venueId = requested ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!getAccessibleVenueIds(session).includes(venueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const staff = await prisma.staff.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })

  return NextResponse.json(
    staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), role: s.role })),
  )
}
