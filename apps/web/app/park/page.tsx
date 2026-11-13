import { prisma } from '@hospo-ops/db'
import { ftpSettingsView } from '@/lib/ftp-settings'
import { getKioskSession } from '@/lib/parking-kiosk.server'
import { KioskUnlock } from '@/components/parking/KioskUnlock'
import { KioskParkingClient } from '@/components/parking/KioskParkingClient'

export const dynamic = 'force-dynamic'

export default async function ParkPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getKioskSession()
  const requested =
    typeof searchParams.venue === 'string'
      ? searchParams.venue
      : Array.isArray(searchParams.venue)
        ? searchParams.venue[0]
        : undefined

  let settings = session
    ? await prisma.ftpSettings.findUnique({ where: { venueId: session.venueId } })
    : null

  // No session: the venue can come from the settings URL, or the most recently
  // updated open kiosk. Only open kiosks (code off) resolve this way.
  if (!settings && requested) {
    const candidate = await prisma.ftpSettings.findUnique({ where: { venueId: requested } })
    if (
      candidate &&
      !candidate.deletedAt &&
      candidate.kioskEnabled &&
      candidate.kioskRequireCode !== true
    ) {
      settings = candidate
    }
  }
  if (!settings && !session) {
    settings = await prisma.ftpSettings.findFirst({
      where: { kioskEnabled: true, kioskRequireCode: false, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    })
  }

  if (!settings) return <KioskUnlock />

  const codeOk = Boolean(session && settings.kioskCodeHash === session.codeHash)
  const open = settings.kioskRequireCode !== true
  const settingsValid =
    !settings.deletedAt && settings.kioskEnabled && (open || codeOk)

  if (!settingsValid) {
    return <KioskUnlock message="KIOSK CODE HAS CHANGED — ENTER THE NEW CODE" />
  }

  const [config, venue] = await Promise.all([
    prisma.parkingConfig.findUnique({ where: { venueId: settings.venueId } }),
    prisma.venue.findUnique({
      where: { id: settings.venueId },
      select: { name: true, timezone: true },
    }),
  ])

  const parkingEnabled =
    Boolean(config) && config?.enabled === true && !config?.deletedAt && Boolean(config?.carparkId)
  if (!parkingEnabled) {
    return <KioskUnlock message="GUEST PARKING IS NOT ENABLED FOR THIS VENUE" />
  }

  const view = ftpSettingsView(settings)

  return (
    <KioskParkingClient
      config={{
        venueId: settings.venueId,
        requireCode: !open,
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
