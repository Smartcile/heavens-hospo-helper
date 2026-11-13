import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@hospo-ops/db'
import {
  buildSelectTimeUrl,
  isValidPlate,
  normalisePlate,
  SCAN2PAY_BASE_URL,
} from '@/lib/parking'
import { formatKioskClock } from '@/lib/parking-kiosk'
import { getKioskSession } from '@/lib/parking-kiosk.server'
import { registerParking } from '@/lib/scan2pay.server'
import { clientKey, createRateLimiter } from '@/lib/rate-limit'

// Customer-facing registration. Deliberately writes NOTHING to the database:
// the plate exists only in the Scan2Pay session and the browser's memory, and
// the kiosk clears it when the visible timer runs out.

const limiter = createRateLimiter(20, 60_000)

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const limit = limiter.take(clientKey(req.headers))
  if (!limit.allowed) {
    return noStore({ error: 'TOO MANY ATTEMPTS — PLEASE SPEAK WITH STAFF' }, 429)
  }

  const session = await getKioskSession()
  if (!session) return noStore({ error: 'KIOSK LOCKED' }, 401)

  const [settings, config] = await Promise.all([
    prisma.ftpSettings.findUnique({ where: { venueId: session.venueId } }),
    prisma.parkingConfig.findUnique({ where: { venueId: session.venueId } }),
  ])

  if (
    !settings ||
    settings.deletedAt ||
    !settings.kioskEnabled ||
    settings.kioskCodeHash !== session.codeHash
  ) {
    return noStore({ error: 'KIOSK LOCKED' }, 401)
  }
  if (!config || !config.enabled || config.deletedAt || !config.carparkId) {
    return noStore({ error: 'GUEST PARKING IS NOT ENABLED FOR THIS VENUE' }, 403)
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const plate = normalisePlate(typeof body.licensePlate === 'string' ? body.licensePlate : '')
  if (!isValidPlate(plate)) {
    return noStore({ error: 'NUMBER PLATE MUST BE 1–6 LETTERS OR DIGITS' }, 422)
  }

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const timezone = venue?.timezone || 'Pacific/Auckland'

  const result = await registerParking({
    target: {
      baseUrl: SCAN2PAY_BASE_URL,
      carparkId: config.carparkId,
      carparkName: config.carparkName,
      durationMinutes: config.durationMinutes,
    },
    plate,
    arrivedAt: new Date(),
    timezone,
    customerEmail: settings.contactEmail,
  })

  const linkUrl = buildSelectTimeUrl({
    baseUrl: SCAN2PAY_BASE_URL,
    carparkId: config.carparkId,
    carparkName: config.carparkName,
    plate,
  })

  let qrDataUrl: string | null = null
  try {
    qrDataUrl = await QRCode.toDataURL(linkUrl, {
      width: 520,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0A0A0A', light: '#FFFFFF' },
    })
  } catch {
    qrDataUrl = null
  }

  return noStore({
    status: result.status,
    ok: result.ok,
    message: result.message,
    plate,
    endTime: formatKioskClock(result.window.expiresAt, timezone),
    expiresAt: result.window.expiresAt.toISOString(),
    existingExpiry: result.existing?.expiry ?? null,
    alreadyActive: result.status === 'ALREADY_ACTIVE',
    qrDataUrl,
    linkUrl,
    carparkName: config.carparkName,
    durationMinutes: config.durationMinutes,
    timezone,
  })
}
