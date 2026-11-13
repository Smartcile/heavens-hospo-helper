import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { parkingHealthForVenue } from '@/lib/parking-health.server'

// Dashboard gate: the parking tile appears when guest parking OR staff plates
// are enabled. The health warning only applies to the guest automation.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [config, ftp] = await Promise.all([
    prisma.parkingConfig.findUnique({
      where: { venueId: session.venueId },
      select: { enabled: true, deletedAt: true },
    }),
    prisma.ftpSettings.findUnique({
      where: { venueId: session.venueId },
      select: { staffParkingEnabled: true, deletedAt: true },
    }),
  ])

  const enabled = Boolean(config && config.enabled && !config.deletedAt)
  const staffParkingEnabled = Boolean(ftp && !ftp.deletedAt && ftp.staffParkingEnabled)

  return NextResponse.json({
    enabled,
    staffParkingEnabled,
    health: enabled ? await parkingHealthForVenue(session.venueId) : null,
  })
}
