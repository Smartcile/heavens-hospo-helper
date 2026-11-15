import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { ftpSettingsView, kioskUrlFor, normaliseFtpInput } from '@/lib/ftp-settings'

// Settings → FTP ("Free the Parking"). One venue-scoped settings row covering
// the customer kiosk, the custom email, the 4-hour carpark and staff plates.

function appUrl() {
  // The standalone customer site can live on its own domain without changing
  // APP_URL (which is still used for QR codes and other HOSPO OPS links).
  return (
    process.env.PARKING_PUBLIC_URL ??
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    ''
  )
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [row, parking, fourHourTypes] = await Promise.all([
    prisma.ftpSettings.findUnique({ where: { venueId: scoped.venueId } }),
    prisma.parkingConfig.findUnique({ where: { venueId: scoped.venueId } }),
    prisma.ftpParkingType.count({
      where: {
        venueId: scoped.venueId,
        isActive: true,
        deletedAt: null,
        claimUrl: { not: null },
      },
    }),
  ])

  return NextResponse.json({
    settings: ftpSettingsView(row && !row.deletedAt ? row : null),
    parking: {
      enabled: Boolean(parking?.enabled && !parking?.deletedAt && parking?.carparkId),
      carparkName: parking?.carparkName ?? null,
      durationMinutes: parking?.durationMinutes ?? 90,
    },
    fourHourReady: fourHourTypes > 0,
    kioskUrl: kioskUrlFor(appUrl(), scoped.venueId),
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const scoped = resolveScopedVenueId(
    session,
    req,
    typeof body.venueId === 'string' ? body.venueId : undefined,
  )
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const input = normaliseFtpInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 422 })

  if (input.value.kioskEnabled) {
    const [parking, fourHourTypes] = await Promise.all([
      prisma.parkingConfig.findUnique({
        where: { venueId: scoped.venueId },
        select: { enabled: true, carparkId: true, deletedAt: true },
      }),
      prisma.ftpParkingType.count({
        where: {
          venueId: scoped.venueId,
          isActive: true,
          deletedAt: null,
          claimUrl: { not: null },
        },
      }),
    ])
    const guestEnabled = Boolean(
      parking?.enabled && parking.carparkId && !parking.deletedAt,
    )
    if (!guestEnabled && fourHourTypes === 0) {
      return NextResponse.json(
        {
          error:
            'ENABLE 90 MINUTE PARKING OR ADD AN ACTIVE 4 HOUR PARKING TYPE BEFORE TURNING THE KIOSK ON',
        },
        { status: 422 },
      )
    }
  }

  if (input.value.kioskRequireCode) {
    const existing = await prisma.ftpSettings.findUnique({
      where: { venueId: scoped.venueId },
      select: { kioskCodeHash: true },
    })
    if (!existing?.kioskCodeHash) {
      return NextResponse.json(
        { error: 'SET A KIOSK CODE BEFORE REQUIRING IT' },
        { status: 422 },
      )
    }
  }

  const data = { ...input.value, deletedAt: null }
  const row = await prisma.ftpSettings.upsert({
    where: { venueId: scoped.venueId },
    create: { venueId: scoped.venueId, ...data },
    update: data,
  })

  return NextResponse.json({
    settings: ftpSettingsView(row),
    kioskUrl: kioskUrlFor(appUrl(), scoped.venueId),
  })
}
