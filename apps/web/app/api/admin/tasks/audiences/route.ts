import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds } from '@/lib/venue-scope'

// Searchable audience options for the checklist editor (who a list applies to).
// Guarded by task view rather than training.playbook.* so a restricted manager
// with task access can still scope a list.
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

  const [departments, sections, positions] = await Promise.all([
    prisma.department.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.section.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true, departmentId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.position.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({ departments, sections, positions })
}
