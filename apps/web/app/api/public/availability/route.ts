import { NextRequest, NextResponse } from 'next/server'
import { venueFromApiKey } from '@/lib/public-api'
import { availabilityForDate } from '@/lib/service-availability'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Live slot availability for a date: per service, per slot — max covers,
 * used covers, remaining, and whether the requested party fits.
 */
export async function GET(req: NextRequest) {
  const venue = await venueFromApiKey(req)
  if (!venue) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const dateKey = params.get('date') ?? ''
  if (!DATE_RE.test(dateKey)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }
  const partySize = Math.max(1, parseInt(params.get('party') ?? '1', 10) || 1)

  const rows = await availabilityForDate(venue.id, dateKey, partySize)

  return NextResponse.json({
    date: dateKey,
    services: rows.map(({ service, resolved, totals }) => ({
      serviceId: service.id,
      serviceName: service.name,
      menuName: service.wooCategoryName,
      requiresBooking: service.requiresBooking,
      closed: resolved.closed,
      slots: totals.map((t) => ({
        startTime: t.startTime,
        endTime: t.endTime,
        maxCovers: t.maxCovers,
        usedCovers: t.usedCovers,
        remaining: t.remaining,
        available: t.available,
      })),
    })),
  })
}
