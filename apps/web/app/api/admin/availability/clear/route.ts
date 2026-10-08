import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import { guardAccess } from '@/lib/permissions'
import { formatDateKey } from '@/lib/scheduling'
import { clearAvailability, parseScope } from '@/lib/availability.server'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

// Admin clear — past/locked and approved days included (manager authority).
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

  const out = await clearAvailability(
    {
      staffId: body.staffId,
      venueId,
      dateKey: body.date,
      scope: parseScope(body.scope),
      seriesId: typeof body.seriesId === 'string' && body.seriesId ? body.seriesId : null,
      reason: null,
    },
    { todayKey: formatDateKey(new Date()), lockDays: 0, bypass: true },
  )

  if ('error' in out) return NextResponse.json({ error: out.error }, { status: 400 })
  return NextResponse.json({ mode: out.mode, skipped: out.skipped })
}
