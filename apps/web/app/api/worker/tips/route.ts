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
  const shareQuery = {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  }
  const periods = includeNotes
    ? await prisma.tipsPeriod.findMany({
        where: { venueId: session!.venueId, deletedAt: null },
        orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
        include: {
          shares: {
            ...shareQuery,
            include: {
              notes: {
                where: { deletedAt: null },
                orderBy: [{ createdAt: 'asc' as const }],
                select: { id: true, body: true, source: true, createdAt: true },
              },
            },
          },
        },
      })
    : await prisma.tipsPeriod.findMany({
        where: { venueId: session!.venueId, deletedAt: null },
        orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
        include: { shares: shareQuery },
      })

  const payload = periods.map(buildTipsPeriodPayload)
  if (!statusOnly) {
    if (!includeNotes) return NextResponse.json({ periods: payload })
    // The query branch guarantees `notes` on each share; keep the projection
    // explicit so the client renders a stable shape.
    const raw = periods as unknown as Array<{
      shares: Array<{
        id: string
        notes?: Array<{ id: string; body: string; source: string; createdAt: Date }>
      }>
    }>
    const withNotes = payload.map((period, index) => {
      const notesById = new Map(raw[index].shares.map((s) => [s.id, s.notes ?? []]))
      return {
        ...period,
        shares: period.shares.map((share) => ({
          ...share,
          notes: (notesById.get(share.id ?? '') ?? []).map((note) => ({
            ...note,
            createdAt: note.createdAt.toISOString(),
          })),
        })),
      }
    })
    return NextResponse.json({ periods: withNotes })
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
