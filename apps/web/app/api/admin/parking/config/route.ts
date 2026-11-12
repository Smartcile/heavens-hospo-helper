import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import {
  DEFAULT_HEALTH_PLATE,
  DEFAULT_PARKING_DURATION_MINUTES,
  isValidPlate,
  normaliseCheckMode,
  normalisePlate,
  parseScan2PayUrl,
  SCAN2PAY_BASE_URL,
} from '@/lib/parking'
import { fetchCarparkName } from '@/lib/scan2pay.server'
import { parkingHealthForVenue } from '@/lib/parking-health.server'

// Per-venue Scan2Pay config. Disabled and silent by default; the worker tile
// and cron only activate once enabled here with a valid carpark URL.

function emptyConfig(venueId: string) {
  return {
    id: null,
    venueId,
    enabled: false,
    entryUrl: null,
    carparkId: null,
    carparkName: null,
    durationMinutes: DEFAULT_PARKING_DURATION_MINUTES,
    healthCheckMode: 'READINESS',
    healthPlate: DEFAULT_HEALTH_PLATE,
    lastCheckAt: null,
    lastCheckOk: null,
    lastCheckMessage: null,
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [config, health] = await Promise.all([
    prisma.parkingConfig.findUnique({ where: { venueId: scoped.venueId } }),
    parkingHealthForVenue(scoped.venueId),
  ])

  return NextResponse.json({
    config: config && !config.deletedAt ? config : emptyConfig(scoped.venueId),
    health,
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

  const enabled = body.enabled === true
  const entryUrlInput = typeof body.entryUrl === 'string' ? body.entryUrl.trim() : ''

  const durationRaw = Number(body.durationMinutes ?? DEFAULT_PARKING_DURATION_MINUTES)
  const durationMinutes = Number.isFinite(durationRaw)
    ? Math.min(1440, Math.max(15, Math.round(durationRaw)))
    : DEFAULT_PARKING_DURATION_MINUTES

  const healthCheckMode = normaliseCheckMode(body.healthCheckMode)
  const plateRaw = typeof body.healthPlate === 'string' ? body.healthPlate : ''
  const healthPlate = plateRaw.trim() ? normalisePlate(plateRaw) : DEFAULT_HEALTH_PLATE
  if (!isValidPlate(healthPlate)) {
    return NextResponse.json(
      { error: 'HEALTH PLATE MUST BE 1–6 LETTERS OR DIGITS' },
      { status: 422 },
    )
  }

  let carparkId: number | null = null
  let entryUrl: string | null = null

  if (entryUrlInput) {
    const parsed = parseScan2PayUrl(entryUrlInput)
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 })
    carparkId = parsed.url.carparkId
    entryUrl = parsed.url.entryUrl
  } else if (enabled) {
    return NextResponse.json(
      { error: 'PASTE THE CARPARK URL BEFORE ENABLING' },
      { status: 422 },
    )
  }

  let carparkName: string | null = null
  let warning: string | undefined
  if (carparkId) {
    try {
      carparkName = await fetchCarparkName({ baseUrl: SCAN2PAY_BASE_URL, carparkId })
    } catch {
      carparkName = null
    }
    if (!carparkName) warning = 'COULD NOT READ THE CARPARK NAME — CHECK THE URL'
  }

  const data = {
    enabled,
    entryUrl,
    carparkId,
    carparkName,
    durationMinutes,
    healthCheckMode,
    healthPlate,
    deletedAt: null,
  }

  const existing = await prisma.parkingConfig.findUnique({
    where: { venueId: scoped.venueId },
    select: { id: true },
  })
  const config = existing
    ? await prisma.parkingConfig.update({ where: { venueId: scoped.venueId }, data })
    : await prisma.parkingConfig.create({ data: { venueId: scoped.venueId, ...data } })

  return NextResponse.json({ config, health: await parkingHealthForVenue(scoped.venueId), warning })
}
