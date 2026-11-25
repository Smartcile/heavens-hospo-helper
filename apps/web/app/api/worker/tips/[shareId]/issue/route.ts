import { NextRequest, NextResponse } from 'next/server'
import { prisma, TipsShareStatus } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayAccessTips } from '@/lib/worker-tips-access'
import { maybeFullyIssuePeriod } from '@/lib/tips.server'

interface Params {
  params: { shareId: string }
}

/**
 * POST /api/worker/tips/[shareId]/issue
 * { note? }
 *
 * The admin (in worker view) marks an APPROVED share as paid. Only APPROVED
 * rows can transition; a double tap / second tab gets a 409. When the last
 * share is issued the period becomes FULLY_ISSUED automatically.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!workerMayAccessTips(session?.role)) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const share = await prisma.tipsShare.findFirst({
    where: { id: params.shareId, deletedAt: null },
    include: { tipsPeriod: { select: { id: true, venueId: true, deletedAt: true } } },
  })
  if (!share || share.tipsPeriod.deletedAt || share.tipsPeriod.venueId !== session!.venueId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (share.status !== TipsShareStatus.APPROVED) {
    return NextResponse.json({ error: 'SHARE IS NOT APPROVED FOR ISSUE' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const note =
    typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const now = new Date()

  const updated = await prisma.tipsShare.updateMany({
    where: {
      id: share.id,
      tipsPeriodId: share.tipsPeriod.id,
      status: TipsShareStatus.APPROVED,
      deletedAt: null,
    },
    data: {
      status: TipsShareStatus.ISSUED,
      issuedAt: now,
      issuedById: session!.staffId,
      issueNote: note,
    },
  })
  if (updated.count === 0) {
    return NextResponse.json({ error: 'SHARE IS NOT APPROVED FOR ISSUE' }, { status: 409 })
  }

  const fullyIssued = await maybeFullyIssuePeriod(share.tipsPeriod.id)
  const saved = await prisma.tipsShare.findUnique({ where: { id: share.id } })

  return NextResponse.json({ share: saved, fullyIssued })
}
