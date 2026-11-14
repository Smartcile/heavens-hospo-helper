import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getAccessibleVenueIds, getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { formatDateKey } from '@/lib/scheduling'
import { clearAvailability, parseScope, unlockSeriesAvailability } from '@/lib/availability.server'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function utcDay(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

// Delete this day, this day onwards, or the whole series. Needs the
// `team.availability.edit` grant (ADMIN bypasses). Locked days are skipped and
// reported; a client that explicitly selects locked days passes `unlockDates`
// so an accepted "unlock & delete" really removes them.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    staffId?: string
    venueId?: string
    date?: string
    scope?: unknown
    seriesId?: string | null
    unlockDates?: unknown
  } | null

  const venueId = getManagerVenueId(session, req) ?? body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (session.user.role === 'ADMIN' && !getAccessibleVenueIds(session).includes(venueId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!body?.staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!body.date || !DATE_KEY.test(body.date)) return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })
  if (!body.seriesId) return NextResponse.json({ error: 'THIS DAY IS NOT PART OF A SERIES' }, { status: 400 })

  const dateKey = body.date
  const scope = parseScope(body.scope)
  const requestedUnlocks = Array.isArray(body.unlockDates)
    ? body.unlockDates.filter((d): d is string => typeof d === 'string' && DATE_KEY.test(d))
    : []

  const staff = await prisma.staff.findFirst({
    where: { id: body.staffId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })

  // Only unlock what the requested scope will actually remove: a day outside
  // the scope cannot be deleted, so unlocking it would leave a surprising
  // side-effect behind.
  let unlockDates = requestedUnlocks
  if (requestedUnlocks.length > 0) {
    const seriesRows = await prisma.staffAvailability.findMany({
      where: { staffId: body.staffId, venueId, seriesId: body.seriesId, deletedAt: null },
      select: { date: true },
    })
    const inScope = new Set(
      scope === 'THIS'
        ? [dateKey]
        : scope === 'FROM'
          ? seriesRows.map((r) => formatDateKey(r.date)).filter((d) => d >= dateKey)
          : seriesRows.map((r) => formatDateKey(r.date)),
    )
    unlockDates = requestedUnlocks.filter((d) => inScope.has(d))
  }

  // Unlock first, only for the days the manager explicitly selected. This is a
  // no-op (and never unlocks anything) when the client sends no dates.
  const unlock = unlockDates.length > 0
    ? await unlockSeriesAvailability({
        staffId: body.staffId,
        venueId,
        seriesId: body.seriesId,
        dates: unlockDates,
        actorId: session.user.id,
      })
    : { unlocked: [] as string[], count: 0 }

  const out = await clearAvailability(
    {
      staffId: body.staffId,
      venueId,
      dateKey: body.date,
      scope,
      seriesId: body.seriesId,
      reason: null,
    },
    { todayKey: formatDateKey(new Date()), lockDays: 0, bypass: true },
  )

  if ('error' in out) {
    return NextResponse.json(
      { error: out.error, ...(out.locked ? { locked: out.locked } : {}) },
      { status: out.locked ? 409 : 400 },
    )
  }

  // The removed days cannot still be sitting in the approvals queue.
  const removed = out.mode === 'SAVED' ? out.plan.removeDates : []
  if (removed.length > 0) {
    await prisma.availabilityEditRequest.updateMany({
      where: {
        staffId: body.staffId,
        venueId,
        status: 'PENDING',
        deletedAt: null,
        date: { in: removed.map(utcDay) },
      },
      data: { deletedAt: new Date() },
    })
  }

  return NextResponse.json({
    mode: out.mode,
    skipped: out.skipped,
    unlocked: unlock.unlocked,
    unlockedCount: unlock.count,
  })
}
