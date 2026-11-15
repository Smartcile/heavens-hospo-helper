// Server-only kiosk access resolver shared by the public 4-hour routes. Mirrors
// the 90-minute register route: a signed kiosk cookie wins, otherwise an open
// kiosk is identified by the venueId in the request body.

import { prisma, type FtpSettings } from '@hospo-ops/db'
import { getKioskSession } from './parking-kiosk.server'

export type KioskAccessResult =
  | { ok: true; settings: FtpSettings; venueId: string }
  | { ok: false; status: number; error: string }

export async function resolveKioskAccess(
  body: Record<string, unknown>,
): Promise<KioskAccessResult> {
  const session = await getKioskSession()
  const venueId =
    session?.venueId ?? (typeof body.venueId === 'string' ? body.venueId : '')
  if (!venueId) return { ok: false, status: 401, error: 'KIOSK LOCKED' }

  const settings = await prisma.ftpSettings.findUnique({ where: { venueId } })
  if (!settings || settings.deletedAt || !settings.kioskEnabled) {
    return { ok: false, status: 401, error: 'KIOSK LOCKED' }
  }
  if (settings.kioskRequireCode === true) {
    if (!session || settings.kioskCodeHash !== session.codeHash) {
      return { ok: false, status: 401, error: 'KIOSK LOCKED' }
    }
  }
  return { ok: true, settings, venueId }
}
