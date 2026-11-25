import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { workerMayAccessTips } from '@/lib/worker-tips-access'
import { buildTipsPeriodPayload } from '@/lib/tips.server'

/**
 * GET /api/worker/tips
 *   no query      → the manager's issuance desk (amounts included)
 *   ?status=1     → STATUS-ONLY projection for the dashboard tile. Never cash,
 *                   POS, pool, weights or per-person amounts.
 *
 * Floor staff get 403 — tips and every monetary value are hidden from them.
 */
export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!workerMayAccessTips(session?.role)) {
    return NextResponse.json({ error: 'ACCESS DENIED' }, { status: 403 })
  }

  const statusOnly = req.nextUrl.searchParams.get('status') === '1'
  const periods = await prisma.tipsPeriod.findMany({
    where: { venueId: session!.venueId, deletedAt: null },
    orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      shares: {
        where: { deletedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  })

  const payload = periods.map(buildTipsPeriodPayload)
  if (!statusOnly) return NextResponse.json({ periods: payload })

  return NextResponse.json({
    periods: payload.map((p) => ({
      id: p.id,
      label:
        p.label ||
        `${p.fromDate.toISOString().slice(0, 10)} - ${p.toDate.toISOString().slice(0, 10)}`,
      fromDate: p.fromDate,
      toDate: p.toDate,
      fullyIssuedAt: p.fullyIssuedAt,
      progress: p.progress,
    })),
  })
}
