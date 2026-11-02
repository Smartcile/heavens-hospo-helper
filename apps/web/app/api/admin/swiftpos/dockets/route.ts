import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { fetchKitchenDockets } from '@/lib/swiftpos.server'
import { docketWindow, normaliseDocketMinutes } from '@/lib/swiftpos-dockets'

// Live kitchen dockets — the open sales SwiftDOSnet reads straight from the POS.
// Proxied server-side (SwiftDOSnet has no auth and must never be called from the
// browser). Default window is the last 60 minutes; `?minutes=0` returns every
// line on the open sales. See MENUS.md §8.

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'orders.orders.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, swiftPosBaseUrl: true, timezone: true },
  })
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  if (!venue.swiftPosBaseUrl) {
    return NextResponse.json(
      { error: 'SWIFTPOS NOT CONNECTED — SET THE SWIFTDOSNET URL ON THE VENUE' },
      { status: 400 },
    )
  }

  const minutes = normaliseDocketMinutes(req.nextUrl.searchParams.get('minutes'))
  const { from, to } = docketWindow(Date.now(), venue.timezone, minutes)

  let dockets
  try {
    dockets = await fetchKitchenDockets(venue.swiftPosBaseUrl, from, to)
  } catch (e) {
    return NextResponse.json(
      { error: `COULD NOT REACH SWIFTDOSNET: ${(e as Error).message}` },
      { status: 502 },
    )
  }

  return NextResponse.json({
    venueId,
    venueName: venue.name,
    minutes,
    from,
    to,
    generatedAt: new Date().toISOString(),
    dockets,
  })
}
