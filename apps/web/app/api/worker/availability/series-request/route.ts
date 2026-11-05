import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { requestSeriesRemoval } from '@/lib/availability.server'
import { WORKER_EDIT_SCOPES } from '@/lib/availability'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function venueTodayKey(timezone?: string | null): string {
  return formatDateKey(getTodayDate(timezone ?? undefined))
}

// A worker asks a manager to remove a weekly series from the clicked day
// onwards. This always files an edit request — it never deletes rows and never
// clears a single day (the /clear routes stay 403). Past and manager-locked
// days are reported back as `skipped`.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    date?: string
    seriesId?: string | null
    reason?: string | null
  } | null

  const dateKey = body?.date
  if (!dateKey || !DATE_KEY.test(dateKey)) {
    return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })
  }
  if (typeof body?.seriesId !== 'string' || !body.seriesId) {
    return NextResponse.json({ error: 'THIS DAY IS NOT PART OF A SERIES' }, { status: 400 })
  }

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { availabilityLockDays: true, timezone: true },
  })

  const out = await requestSeriesRemoval(
    {
      staffId: session.staffId,
      venueId: session.venueId,
      dateKey,
      seriesId: body.seriesId,
      reason: typeof body.reason === 'string' ? body.reason : null,
    },
    {
      todayKey: venueTodayKey(venue?.timezone),
      lockDays: venue?.availabilityLockDays ?? 0,
      bypass: false,
      allowedScopes: WORKER_EDIT_SCOPES,
    },
  )

  if ('error' in out) {
    return NextResponse.json(
      { error: out.error, ...(out.locked ? { locked: out.locked } : {}) },
      { status: out.status },
    )
  }

  return NextResponse.json({ mode: out.mode, requestId: out.requestId, skipped: out.skipped })
}
