import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getAccessibleVenueIds, getManagerVenueId, resolveScopedVenueId } from '@/lib/venue-scope'
import { isAvailabilityDateKey } from '@/lib/availability-comments'
import { formatDateKey } from '@/lib/scheduling'
import { getTodayDate } from '@/lib/utils'
import { shiftDay } from '@/lib/date-nav'
import { HISTORY_DEFAULT_DAYS, loadAvailabilityHistory } from '@/lib/availability-history.server'

type SessionLike = {
  user: { id: string; role: string; venueId: string; availableVenueIds: string[] }
}

/**
 * ADMIN works in the venue selected by the `admin-active-venue` cookie
 * (falling back to home); MANAGER is locked to their effective venue.
 */
function activeVenueId(session: SessionLike, req: NextRequest): string {
  if (session.user.role === 'MANAGER') return getManagerVenueId(session, req) ?? session.user.venueId
  const cookieVenueId = req.cookies.get('admin-active-venue')?.value
  return cookieVenueId && getAccessibleVenueIds(session).includes(cookieVenueId)
    ? cookieVenueId
    : session.user.venueId
}

/**
 * GET /api/admin/availability/history — the read-only audit trail behind the
 * availability HISTORY popup (#206).
 *
 * Returns every declaration day and edit request in the window, in every
 * status, including soft-deleted withdrawals and cancelled declarations, with
 * reviewer names and day comments. It writes nothing; a restricted manager with
 * `team.availability.view` gets the same read-only payload.
 *
 * Query: `venueId` (ADMIN only), `staffId`, `from`, `to` (YYYY-MM-DD, default
 * the last 90 days), `status` (ALL | PENDING | APPLIED | DISCARDED |
 * SUPERSEDED | WITHDRAWN) and `includeDeleted` (default 1).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'team.availability.view')
  if (denied) return denied

  const requested = req.nextUrl.searchParams.get('venueId') ?? activeVenueId(session, req)
  const scoped = resolveScopedVenueId(session, req, requested)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId

  const params = req.nextUrl.searchParams
  const fromParam = params.get('from')
  const toParam = params.get('to')
  if (fromParam && !isAvailabilityDateKey(fromParam)) {
    return NextResponse.json({ error: 'PICK A VALID START DATE' }, { status: 400 })
  }
  if (toParam && !isAvailabilityDateKey(toParam)) {
    return NextResponse.json({ error: 'PICK A VALID END DATE' }, { status: 400 })
  }

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  })
  const timezone = venue?.timezone || 'Pacific/Auckland'
  const today = formatDateKey(getTodayDate(timezone))
  const to = toParam ?? today
  const from = fromParam ?? shiftDay(to, -(HISTORY_DEFAULT_DAYS - 1))
  if (from > to) {
    return NextResponse.json({ error: 'START DATE MUST BE BEFORE THE END DATE' }, { status: 400 })
  }

  const staffId = params.get('staffId')
  if (staffId) {
    // Venue scope is the gate — the picker deliberately offers departed staff
    // so their past declarations/requests stay filterable.
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, venueId },
      select: { id: true },
    })
    if (!staff) return NextResponse.json({ error: 'STAFF NOT FOUND' }, { status: 404 })
  }

  const includeDeleted = params.get('includeDeleted') !== '0' && params.get('includeDeleted') !== 'false'

  const history = await loadAvailabilityHistory({
    venueId,
    from,
    to,
    timezone,
    staffId,
    status: params.get('status'),
    includeDeleted,
  })

  return NextResponse.json(history)
}
