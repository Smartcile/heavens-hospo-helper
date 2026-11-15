import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { loadParkingMetrics } from '@/lib/parking-metrics.server'
import { resolveScopedVenueId } from '@/lib/venue-scope'

const RANGES = new Set(['24h', '7d', '30d', 'all'])

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const denied = await guardAccess(session, req, 'performance.parking.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rawRange = req.nextUrl.searchParams.get('range') ?? '30d'
  const range = RANGES.has(rawRange) ? rawRange : '30d'
  const to = new Date()
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : range === '30d' ? 24 * 30 : null
  const from = hours === null ? null : new Date(to.getTime() - hours * 60 * 60 * 1000)

  const result = await loadParkingMetrics({
    venueId: scoped.venueId,
    from,
    to,
  })

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
