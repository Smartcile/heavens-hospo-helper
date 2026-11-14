import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { approvalLockFields } from '@/lib/availability'
import { formatDateKey } from '@/lib/scheduling'
import { cancelPendingAvailability, supersedeRequestsCoveredBy } from '@/lib/availability.server'

// Confirm, decline or cancel declared availability. `ids` reviews individual
// days; `seriesId` (+ staffId) reviews every still-pending occurrence of a
// weekly series in one action. DELETE cancels the declaration outright. NOTE
// writes the manager's review note on the resolved days without changing their
// status (a declaration card can correct its note after the fact).
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
    action?: 'APPROVE' | 'DECLINE' | 'DELETE' | 'NOTE'
    reviewNote?: string | null
  } | null

  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  const action = body?.action
  if (action !== 'APPROVE' && action !== 'DECLINE' && action !== 'DELETE' && action !== 'NOTE') {
    return NextResponse.json({ error: 'action must be APPROVE, DECLINE, DELETE or NOTE' }, { status: 400 })
  }

  const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === 'string') : []
  if (ids.length === 0 && !(body?.seriesId && body?.staffId)) {
    return NextResponse.json({ error: 'ids or seriesId+staffId are required' }, { status: 400 })
  }

  if (action === 'DELETE') {
    const deleted = await cancelPendingAvailability({
      venueId,
      ids,
      staffId: body?.staffId ?? null,
      seriesId: body?.seriesId ?? null,
    })
    return NextResponse.json({ deleted })
  }

  const where = ids.length > 0
    ? { id: { in: ids } }
    : { seriesId: body!.seriesId!, staffId: body!.staffId! }

  if (action === 'NOTE') {
    const reviewNote = typeof body?.reviewNote === 'string' && body.reviewNote.trim()
      ? body.reviewNote.trim()
      : null
    const result = await prisma.staffAvailability.updateMany({
      where: { ...where, venueId, deletedAt: null },
      data: { reviewNote },
    })
    return NextResponse.json({ updated: result.count })
  }

  // Only a single-day declaration locks its row. A series (or a multi-day
  // selection) is protected by the cut-off gate and the edit-request path, so
  // approving one must not lock every occurrence. Declining never locks.
  const approve = action === 'APPROVE'
  const lockSingleDay = approve && ids.length === 1 && !body?.seriesId
  const result = await prisma.staffAvailability.updateMany({
    where: { ...where, venueId, deletedAt: null, status: 'PENDING' },
    data: {
      status: approve ? 'APPROVED' : 'DECLINED',
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewNote: typeof body?.reviewNote === 'string' && body.reviewNote.trim() ? body.reviewNote.trim() : null,
      ...approvalLockFields(lockSingleDay, session.user.id),
    },
  })

  // Confirming a declaration covers any pending request whose whole target set
  // now sits inside the confirmed dates — otherwise confirming would silently
  // orphan the request in the queue. Only genuinely APPROVED rows count:
  // a DECLINED occurrence in the same series is not evidence that covers it.
  // Partial overlaps stay PENDING.
  let superseded = 0
  if (approve) {
    const confirmed = await prisma.staffAvailability.findMany({
      where: { ...where, venueId, deletedAt: null, status: 'APPROVED' },
      select: { staffId: true, date: true },
    })
    const byStaff = new Map<string, string[]>()
    for (const row of confirmed) {
      const dates = byStaff.get(row.staffId) ?? []
      dates.push(formatDateKey(row.date))
      byStaff.set(row.staffId, dates)
    }
    for (const [staffId, dates] of byStaff) {
      superseded += await supersedeRequestsCoveredBy({ staffId, venueId, dates, actorId: session.user.id })
    }
  }

  return NextResponse.json({ updated: result.count, superseded })
}
