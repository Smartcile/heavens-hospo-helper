import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { clearAvailability, parseScope } from '@/lib/availability.server'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

// Clear a day, or a slice of a weekly series (THIS / FROM / ALL). Approved
// rows are protected — the clear becomes an edit request instead.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    date?: string
    scope?: unknown
    seriesId?: string | null
    reason?: string | null
  } | null

  const dateKey = body?.date
  if (!dateKey || !DATE_KEY.test(dateKey)) {
    return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })
  }

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { availabilityLockDays: true, timezone: true },
  })

  const out = await clearAvailability(
    {
      staffId: session.staffId,
      venueId: session.venueId,
      dateKey,
      scope: parseScope(body?.scope),
      seriesId: typeof body?.seriesId === 'string' && body.seriesId ? body.seriesId : null,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    },
    {
      todayKey: formatDateKey(getTodayDate(venue?.timezone ?? undefined)),
      lockDays: venue?.availabilityLockDays ?? 0,
      bypass: false,
    },
  )

  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 400 })
  return NextResponse.json({
    mode: out.mode,
    requestId: out.mode === 'REQUEST' ? out.requestId : null,
    skipped: out.skipped,
  })
}
