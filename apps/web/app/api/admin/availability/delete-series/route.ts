import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { formatDateKey } from '@/lib/scheduling'
import { clearAvailability, parseScope } from '@/lib/availability.server'

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function utcDay(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`)
}

// ADMIN-only series delete — removes this day, this day onwards, or the whole
// series. Locked days are skipped (never force-deleted) and reported back.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'ADMIN ONLY' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    staffId?: string
    venueId?: string
    date?: string
    scope?: unknown
    seriesId?: string | null
  } | null

  const venueId = body?.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })
  if (!body.date || !DATE_KEY.test(body.date)) return NextResponse.json({ error: 'PICK A DAY' }, { status: 400 })
  if (!body.seriesId) return NextResponse.json({ error: 'THIS DAY IS NOT PART OF A SERIES' }, { status: 400 })

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
  const removed = out.plan?.removeDates ?? []
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

  return NextResponse.json({ mode: out.mode, skipped: out.skipped })
}
