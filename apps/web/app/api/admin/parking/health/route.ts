import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { runParkingHealthCheck, parkingHealthForVenue } from '@/lib/parking-health.server'

// Manual "RUN CHECK NOW" from Settings → Guest Parking.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const scoped = resolveScopedVenueId(
    session,
    req,
    typeof body.venueId === 'string' ? body.venueId : undefined,
  )
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const config = await prisma.parkingConfig.findUnique({
    where: { venueId: scoped.venueId },
    select: { id: true, enabled: true, deletedAt: true },
  })
  if (!config || !config.enabled || config.deletedAt) {
    return NextResponse.json({ error: 'PARKING IS NOT ENABLED' }, { status: 400 })
  }

  const mode = body.mode === 'FULL' ? 'FULL' : body.mode === 'READINESS' ? 'READINESS' : undefined
  const result = await runParkingHealthCheck({
    venueId: scoped.venueId,
    mode,
    force: true,
  })

  return NextResponse.json({
    result,
    health: await parkingHealthForVenue(scoped.venueId),
  })
}
