import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { formatDateKey } from '@/lib/scheduling'
import { unlockSeriesAvailability } from '@/lib/availability.server'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

type SessionLike = {
  user: { role: string; venueId: string; availableVenueIds: string[] }
}

function resolveVenueId(session: SessionLike, req: NextRequest, requested?: string | null): string | null {
  return getManagerVenueId(session, req) ?? requested ?? session.user.venueId ?? null
}

/** Every occurrence of a series, with its current lock state, for review. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.view')
  if (denied) return denied

  const url = req.nextUrl
  const staffId = url.searchParams.get('staffId')
  const seriesId = url.searchParams.get('seriesId')
  const venueId = resolveVenueId(session, req, url.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!seriesId) return NextResponse.json({ error: 'seriesId is required' }, { status: 400 })

  const staff = await prisma.staff.findFirst({
    where: { id: staffId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })

  const rows = await prisma.staffAvailability.findMany({
    where: { staffId, venueId, seriesId, deletedAt: null },
    select: { date: true, lockedAt: true, lockedReason: true },
    orderBy: { date: 'asc' },
  })
  if (rows.length === 0) return NextResponse.json({ error: 'SERIES NOT FOUND' }, { status: 404 })

  const dates = rows.map((r) => ({
    date: formatDateKey(r.date),
    locked: !!r.lockedAt,
    lockedAt: r.lockedAt ? r.lockedAt.toISOString() : null,
    lockedReason: r.lockedReason ?? null,
  }))

  return NextResponse.json({
    staffId,
    seriesId,
    total: dates.length,
    lockedCount: dates.filter((d) => d.locked).length,
    dates,
  })
}

/** Unlock the whole series, or only the selected occurrences. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    staffId?: string
    venueId?: string
    seriesId?: string
    dates?: unknown
  } | null

  const venueId = resolveVenueId(session, req, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!body.seriesId) return NextResponse.json({ error: 'seriesId is required' }, { status: 400 })

  let dates: string[] | undefined
  if (Array.isArray(body.dates) && body.dates.length > 0) {
    if (!body.dates.every((d): d is string => typeof d === 'string' && DATE_KEY.test(d))) {
      return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })
    }
    dates = body.dates
  }

  const staff = await prisma.staff.findFirst({
    where: { id: body.staffId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })

  const series = await prisma.staffAvailability.findFirst({
    where: { staffId: body.staffId, venueId, seriesId: body.seriesId, deletedAt: null },
    select: { id: true },
  })
  if (!series) return NextResponse.json({ error: 'SERIES NOT FOUND' }, { status: 404 })

  const result = await unlockSeriesAvailability({
    staffId: body.staffId,
    venueId,
    seriesId: body.seriesId,
    dates,
    actorId: session.user.id,
  })

  return NextResponse.json({ success: true, unlocked: result.unlocked, count: result.count })
}
