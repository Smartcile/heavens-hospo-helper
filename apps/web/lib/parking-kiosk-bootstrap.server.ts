// Shared public kiosk bootstrap. The existing /park page and the public
// bootstrap route both use this so the two cannot drift.

import { prisma } from '@hospo-ops/db'
import type { KioskParkingConfig } from '@/components/parking/KioskParkingClient'
import { ftpHealthForVenue } from './ftp-health-state.server'
import { ftpSettingsView } from './ftp-settings'
import { getKioskSession } from './parking-kiosk.server'

export type KioskBootstrapResult =
  | { locked: true; message?: string }
  | { locked: false; config: KioskParkingConfig }

export async function loadKioskBootstrap(
  requestedVenue?: string | null,
): Promise<KioskBootstrapResult> {
  const session = await getKioskSession()

  let settings = session
    ? await prisma.ftpSettings.findUnique({ where: { venueId: session.venueId } })
    : null

  // No session: a venue may come from the COPY URL, or from the most recently
  // updated open kiosk. Only open kiosks resolve this way.
  if (!settings && requestedVenue) {
    const candidate = await prisma.ftpSettings.findUnique({
      where: { venueId: requestedVenue },
    })
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

  if (!settings) return { locked: true }
  if (!settings.kioskEnabled) {
    return { locked: true, message: 'THE KIOSK IS NOT ENABLED FOR THIS VENUE' }
  }

  const open = settings.kioskRequireCode !== true
  const codeOk = Boolean(session && settings.kioskCodeHash === session.codeHash)
  if (!open && !codeOk) {
    return {
      locked: true,
      message: session ? 'KIOSK CODE HAS CHANGED — ENTER THE NEW CODE' : undefined,
    }
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
    return { locked: true, message: 'PARKING IS NOT ENABLED FOR THIS VENUE' }
  }

  const healthById = new Map(health.map((state) => [state.typeId, state]))
  const view = ftpSettingsView(settings)

  return {
    locked: false,
    config: {
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
    },
  }
}
