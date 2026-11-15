import { prisma } from '@hospo-ops/db'
import { ftpSettingsView } from '@/lib/ftp-settings'
import { ftpHealthForVenue } from '@/lib/ftp-health-state.server'
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
  if (!settings.kioskEnabled) {
    return <KioskUnlock message="THE KIOSK IS NOT ENABLED FOR THIS VENUE" />
  }
  if (!open && !codeOk) {
    return <KioskUnlock message="KIOSK CODE HAS CHANGED — ENTER THE NEW CODE" />
  }

  const [config, venue, types, health] = await Promise.all([
    prisma.parkingConfig.findUnique({ where: { venueId: settings.venueId } }),
    prisma.venue.findUnique({
      where: { id: settings.venueId },
      select: { name: true, timezone: true },
    }),
    prisma.ftpParkingType.findMany({
      where: {
        venueId: settings.venueId,
        isActive: true,
        deletedAt: null,
        claimUrl: { not: null },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        windowLabel: true,
        durationMinutes: true,
      },
    }),
    ftpHealthForVenue(settings.venueId),
  ])

  const guestEnabled = Boolean(
    config?.enabled === true && !config?.deletedAt && config?.carparkId,
  )
  if (!guestEnabled && types.length === 0) {
    return <KioskUnlock message="PARKING IS NOT ENABLED FOR THIS VENUE" />
  }

  const healthById = new Map(health.map((state) => [state.typeId, state]))
  const view = ftpSettingsView(settings)

  return (
    <KioskParkingClient
      config={{
        venueId: settings.venueId,
        requireCode: !open,
        venueName: venue?.name ?? '',
        guestEnabled,
        carparkName: config?.carparkName ?? 'CARPARK',
        durationMinutes: config?.durationMinutes ?? 90,
        timezone: venue?.timezone || 'Pacific/Auckland',
        resetSeconds: view.kioskAutoResetSeconds,
        fourHourTypes: types.map((type) => {
          const state = healthById.get(type.id)
          return {
            id: type.id,
            name: type.name,
            windowLabel: type.windowLabel,
            durationMinutes: type.durationMinutes,
            health: state
              ? { ok: state.ok, stale: state.stale, message: state.message }
              : null,
          }
        }),
      }}
    />
  )
}
