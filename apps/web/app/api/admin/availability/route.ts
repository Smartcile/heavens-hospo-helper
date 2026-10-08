import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { formatDateKey } from '@/lib/scheduling'
import { resolveAvailabilityPresets } from '@/lib/availability'
import {
  loadSeriesSummaries,
  mapAvailabilityEntry,
  mapEditRequest,
  parseRepeat,
  parseScope,
  saveAvailability,
} from '@/lib/availability.server'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function resolveVenueId(session: SessionLike, req: NextRequest): string | null {
  return getManagerVenueId(session, req)
    ?? new URL(req.url).searchParams.get('venueId')
    ?? session.user.venueId
    ?? null
}

// The admin availability page payload: venue staff, the range's entries +
// series, every pending row awaiting confirmation, and pending edit requests.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.view')
  if (denied) return denied

  const url = req.nextUrl
  const venueId = resolveVenueId(session, req)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  const startKey = url.searchParams.get('start') || formatDateKey(new Date())
  const endKey = url.searchParams.get('end') || startKey
  const start = new Date(`${startKey}T00:00:00Z`)
  const end = new Date(`${endKey}T23:59:59Z`)

  const [venue, staff, rows, pendingRows, requests] = await Promise.all([
    prisma.venue.findUnique({ where: { id: venueId }, select: { availabilityPresets: true } }),
    prisma.staff.findMany({
      where: { venueId, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true, employmentType: true },
      orderBy: { firstName: 'asc' },
    }),
    prisma.staffAvailability.findMany({
      where: { venueId, deletedAt: null, date: { gte: start, lte: end } },
      orderBy: [{ date: 'asc' }, { staffId: 'asc' }],
    }),
    prisma.staffAvailability.findMany({
      where: { venueId, deletedAt: null, status: 'PENDING' },
      orderBy: { date: 'asc' },
      take: 200,
    }),
    prisma.availabilityEditRequest.findMany({
      where: { venueId, deletedAt: null, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ])

  const seriesIds = [...rows, ...pendingRows]
    .map((r) => r.seriesId)
    .filter((x): x is string => !!x)
  const series = await loadSeriesSummaries(staff.map((s) => s.id), seriesIds)

  return NextResponse.json({
    venueId,
    staff: staff.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      employmentType: s.employmentType,
    })),
    entries: rows.map(mapAvailabilityEntry),
    series,
    presets: resolveAvailabilityPresets(venue?.availabilityPresets),
    queue: {
      pending: pendingRows.map(mapAvailabilityEntry),
      requests: requests.map(mapEditRequest),
    },
  })
}

// Admin override: write availability for a staff member directly (past/locked
// and approved days included — the manager is the authority here). Always
// stamped APPROVED.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    staffId?: string
    venueId?: string
    date?: string
    availability?: unknown
    repeat?: unknown
    scope?: unknown
    seriesId?: string | null
  } | null

  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!body.date || !DATE_KEY.test(body.date)) return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })

  const staff = await prisma.staff.findFirst({
    where: { id: body.staffId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })

  const out = await saveAvailability(
    {
      staffId: body.staffId,
      venueId,
      dateKey: body.date,
      raw: body.availability,
      repeat: parseRepeat(body.repeat),
      scope: parseScope(body.scope),
      seriesId: typeof body.seriesId === 'string' && body.seriesId ? body.seriesId : null,
      reason: null,
    },
    { todayKey: formatDateKey(new Date()), lockDays: 0, bypass: true },
  )

  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 400 })
  return NextResponse.json({ mode: out.mode, skipped: out.skipped })
}
