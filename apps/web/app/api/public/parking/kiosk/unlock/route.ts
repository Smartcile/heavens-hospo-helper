import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { isValidKioskCode, normaliseKioskCode } from '@/lib/parking-kiosk'
import {
  createKioskSession,
  hashKioskCode,
  setKioskCookie,
} from '@/lib/parking-kiosk.server'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'

// The kiosk is unlocked once per iPad with a code set in Settings → FTP.
// Nothing here identifies a staff member; the code only opens the device.

const limiter = createRateLimiter(5, 60_000)

export async function POST(req: NextRequest) {
  const limit = limiter.take(clientKey(req.headers))
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'TOO MANY ATTEMPTS — WAIT A MINUTE' },
      { status: 429 },
    )
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const code = normaliseKioskCode(typeof body.code === 'string' ? body.code : '')
  if (!isValidKioskCode(code)) {
    return NextResponse.json(
      { error: 'KIOSK CODE MUST BE AT LEAST 6 CHARACTERS' },
      { status: 422 },
    )
  }

  const settings = await prisma.ftpSettings.findFirst({
    where: { kioskCodeHash: hashKioskCode(code), kioskEnabled: true, deletedAt: null },
    select: { venueId: true, kioskCodeHash: true },
  })
  if (!settings?.kioskCodeHash) {
    return NextResponse.json({ error: 'WRONG KIOSK CODE' }, { status: 401 })
  }

  const [parking, fourHourTypes] = await Promise.all([
    prisma.parkingConfig.findUnique({
      where: { venueId: settings.venueId },
      select: { enabled: true, carparkId: true, deletedAt: true },
    }),
    prisma.ftpParkingType.count({
      where: {
        venueId: settings.venueId,
        isActive: true,
        deletedAt: null,
        claimUrl: { not: null },
      },
    }),
  ])
  const guestEnabled = Boolean(parking?.enabled && parking.carparkId && !parking.deletedAt)
  if (!guestEnabled && fourHourTypes === 0) {
    return NextResponse.json(
      { error: 'PARKING IS NOT ENABLED FOR THIS VENUE' },
      { status: 400 },
    )
  }

  const token = await createKioskSession({
    venueId: settings.venueId,
    codeHash: settings.kioskCodeHash,
  })
  setKioskCookie(token)

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
