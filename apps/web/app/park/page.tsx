import { prisma } from '@hospo-ops/db'
import { ftpSettingsView } from '@/lib/ftp-settings'
import { getKioskSession } from '@/lib/parking-kiosk.server'
import { KioskUnlock } from '@/components/parking/KioskUnlock'
import { KioskParkingClient } from '@/components/parking/KioskParkingClient'

export const dynamic = 'force-dynamic'

export default async function ParkPage() {
  const session = await getKioskSession()
  if (!session) return <KioskUnlock />

  const [settings, config, venue] = await Promise.all([
    prisma.ftpSettings.findUnique({ where: { venueId: session.venueId } }),
    prisma.parkingConfig.findUnique({ where: { venueId: session.venueId } }),
    prisma.venue.findUnique({
      where: { id: session.venueId },
      select: { name: true, timezone: true },
    }),
  ])

  const settingsValid =
    Boolean(settings) &&
    !settings?.deletedAt &&
    settings?.kioskEnabled === true &&
    settings?.kioskCodeHash === session.codeHash
  const parkingEnabled =
    Boolean(config) && config?.enabled === true && !config?.deletedAt && Boolean(config?.carparkId)

  if (!settingsValid) {
    return <KioskUnlock message="KIOSK CODE HAS CHANGED — ENTER THE NEW CODE" />
  }
  if (!parkingEnabled) {
    return <KioskUnlock message="GUEST PARKING IS NOT ENABLED FOR THIS VENUE" />
  }

  const view = ftpSettingsView(settings)

  return (
    <KioskParkingClient
      config={{
        venueName: venue?.name ?? '',
        carparkName: config?.carparkName ?? 'CARPARK',
        durationMinutes: config?.durationMinutes ?? 90,
        timezone: venue?.timezone || 'Pacific/Auckland',
        resetSeconds: view.kioskAutoResetSeconds,
        fourHourName: view.fourHourName,
        fourHourEnabled: view.fourHourEnabled && Boolean(view.fourHourEntryUrl),
      }}
    />
  )
}
