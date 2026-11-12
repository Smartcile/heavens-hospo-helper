import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { parkingHealthForVenue } from '@/lib/parking-health.server'

// Dashboard gate: the parking tile only appears once the venue has enabled it.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await prisma.parkingConfig.findUnique({
    where: { venueId: session.venueId },
    select: { enabled: true, deletedAt: true },
  })
  const enabled = Boolean(config && config.enabled && !config.deletedAt)

  return NextResponse.json({
    enabled,
    health: enabled ? await parkingHealthForVenue(session.venueId) : null,
  })
}
