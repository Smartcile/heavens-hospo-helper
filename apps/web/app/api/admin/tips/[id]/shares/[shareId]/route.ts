import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, TipsShareStatus } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'

interface Params {
  params: { id: string; shareId: string }
}

/**
 * PATCH /api/admin/tips/[id]/shares/[shareId]
 * { action: 'APPROVE', note? }
 *
 * Approval is per person. Issuance happens from the worker view (admin-as-
 * worker), and FULLY_ISSUED is automatic once every share is issued.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.approve')
  if (denied) return denied

  const share = await prisma.tipsShare.findFirst({
    where: { id: params.shareId, tipsPeriodId: params.id, deletedAt: null },
    include: { tipsPeriod: { select: { venueId: true, deletedAt: true } } },
  })
  if (!share || share.tipsPeriod.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const managerVenueId = getManagerVenueId(session, req)
  if (session.user.role === 'MANAGER' && managerVenueId && share.tipsPeriod.venueId !== managerVenueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'APPROVE') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  }
  if (share.status !== TipsShareStatus.PLANNED) {
    return NextResponse.json({ error: 'SHARE IS NOT AWAITING APPROVAL' }, { status: 409 })
  }

  const note =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const now = new Date()

  // Conditional update makes a double tap (or a second admin tab) a clean 409
  // instead of approving twice.
  const updated = await prisma.tipsShare.updateMany({
    where: { id: share.id, tipsPeriodId: params.id, status: TipsShareStatus.PLANNED, deletedAt: null },
    data: {
      status: TipsShareStatus.APPROVED,
      approvedAt: now,
      approvedById: session.user.id,
      approvalNote: note,
    },
  })
  if (updated.count === 0) {
    return NextResponse.json({ error: 'SHARE IS NOT AWAITING APPROVAL' }, { status: 409 })
  }

  const saved = await prisma.tipsShare.findUnique({ where: { id: share.id } })
  return NextResponse.json(saved)
}
