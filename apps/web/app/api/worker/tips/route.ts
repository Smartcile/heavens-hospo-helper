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
  // Notes are opt-in so the default payload is unchanged (#180).
  const includeNotes = !statusOnly && req.nextUrl.searchParams.get('notes') === '1'
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
  if (!statusOnly) {
    if (!includeNotes) return NextResponse.json({ periods: payload })
    // One extra query only when asked; no nested include and no cast.
    const shareIds = payload.flatMap((period) =>
      period.shares.map((share) => share.id).filter((id): id is string => !!id),
    )
    const notes = shareIds.length
      ? await prisma.tipsShareNote.findMany({
          where: { tipsShareId: { in: shareIds }, deletedAt: null },
          orderBy: [{ createdAt: 'asc' }],
          select: { id: true, body: true, source: true, createdAt: true, tipsShareId: true },
        })
      : []
    const notesByShare = new Map<
      string,
      Array<{ id: string; body: string; source: string; createdAt: string }>
    >()
    for (const note of notes) {
      const list = notesByShare.get(note.tipsShareId) ?? []
      list.push({
        id: note.id,
        body: note.body,
        source: note.source,
        createdAt: note.createdAt.toISOString(),
      })
      notesByShare.set(note.tipsShareId, list)
    }
    return NextResponse.json({
      periods: payload.map((period) => ({
        ...period,
        shares: period.shares.map((share) => ({
          ...share,
          notes: notesByShare.get(share.id ?? '') ?? [],
        })),
      })),
    })
  }

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
