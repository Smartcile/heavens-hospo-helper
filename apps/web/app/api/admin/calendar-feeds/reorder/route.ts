import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId, getAccessibleVenueIds } from '@/lib/venue-scope'

// Persist the room order shown on the event roster (drag-reordered in Settings).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.roster.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    venueId?: string
    orderedIds?: string[]
  } | null
  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  const orderedIds = Array.isArray(body?.orderedIds) ? body!.orderedIds : []
  if (!venueId || orderedIds.length === 0) {
    return NextResponse.json({ error: 'venueId and orderedIds are required' }, { status: 400 })
  }
  if (session.user.role !== 'ADMIN' && !getAccessibleVenueIds(session).includes(venueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.calendarFeed.updateMany({
        where: { id, venueId, deletedAt: null },
        data: { sortOrder: index },
      }),
    ),
  )

  return NextResponse.json({ success: true })
}
