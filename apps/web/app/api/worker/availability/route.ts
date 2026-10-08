import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { keyOfDay } from '@/lib/date-nav'
import { resolveAvailabilityPresets } from '@/lib/availability'
import {
  loadPendingRequests,
  loadSeriesSummaries,
  mapAvailabilityEntry,
  parseRepeat,
  parseScope,
  saveAvailability,
} from '@/lib/availability.server'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function venueTodayKey(timezone?: string | null): string {
  return formatDateKey(getTodayDate(timezone ?? undefined))
}

// The worker's own availability: employment type (drives the casual UNSET
// hint), the venue's lock-out + quick-pick presets, every entry in range,
// series summaries and any pending edit requests the worker has filed.
export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl
  const startKey = url.searchParams.get('start') || keyOfDay(new Date())
  const endKey = url.searchParams.get('end') || startKey
  const start = new Date(`${startKey}T00:00:00Z`)
  const end = new Date(`${endKey}T23:59:59Z`)

  const [staff, venue, rows] = await Promise.all([
    prisma.staff.findUnique({
      where: { id: session.staffId },
      select: { employmentType: true },
    }),
    prisma.venue.findUnique({
      where: { id: session.venueId },
      select: { availabilityLockDays: true, timezone: true, availabilityPresets: true },
    }),
    prisma.staffAvailability.findMany({
      where: { staffId: session.staffId, deletedAt: null, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    }),
  ])

  const entries = rows.map(mapAvailabilityEntry)
  const seriesIds = rows.map((r) => r.seriesId).filter((x): x is string => !!x)
  const [series, requests] = await Promise.all([
    loadSeriesSummaries([session.staffId], seriesIds),
    loadPendingRequests(session.staffId, startKey, endKey),
  ])

  return NextResponse.json({
    employmentType: staff?.employmentType ?? null,
    lockDays: venue?.availabilityLockDays ?? 0,
    today: venueTodayKey(venue?.timezone),
    presets: resolveAvailabilityPresets(venue?.availabilityPresets),
    entries,
    series,
    requests,
  })
}

// Save availability for a day / weekly series, or clear it. Changing a day
// whose row a manager has APPROVED files an edit request instead of touching
// it; past and locked days are protected server-side.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    date?: string
    availability?: unknown
    repeat?: unknown
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

  const out = await saveAvailability(
    {
      staffId: session.staffId,
      venueId: session.venueId,
      dateKey,
      raw: body?.availability,
      repeat: parseRepeat(body?.repeat),
      scope: parseScope(body?.scope),
      seriesId: typeof body?.seriesId === 'string' && body.seriesId ? body.seriesId : null,
      reason: typeof body?.reason === 'string' ? body.reason : null,
    },
    {
      todayKey: venueTodayKey(venue?.timezone),
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
