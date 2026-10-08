import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'

// Confirm or decline declared availability. `ids` reviews individual days;
// `seriesId` (+ staffId) reviews every still-pending occurrence of a weekly
// series in one action.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.approve')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    ids?: string[]
    seriesId?: string
    staffId?: string
    venueId?: string
    action?: 'APPROVE' | 'DECLINE'
    reviewNote?: string | null
  } | null

  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  const action = body?.action
  if (action !== 'APPROVE' && action !== 'DECLINE') {
    return NextResponse.json({ error: 'action must be APPROVE or DECLINE' }, { status: 400 })
  }

  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
  if (ids.length === 0 && !(body?.seriesId && body?.staffId)) {
    return NextResponse.json({ error: 'ids or seriesId+staffId are required' }, { status: 400 })
  }

  const where = ids.length > 0
    ? { id: { in: ids } }
    : { seriesId: body!.seriesId!, staffId: body!.staffId! }

  const result = await prisma.staffAvailability.updateMany({
    where: { ...where, venueId, deletedAt: null, status: 'PENDING' },
    data: {
      status: action === 'APPROVE' ? 'APPROVED' : 'DECLINED',
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote: typeof body?.reviewNote === 'string' && body.reviewNote.trim() ? body.reviewNote.trim() : null,
    },
  })

  return NextResponse.json({ updated: result.count })
}
