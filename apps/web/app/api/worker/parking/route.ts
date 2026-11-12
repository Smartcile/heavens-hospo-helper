import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import {
  buildSelectTimeUrl,
  checkArrival,
  isValidPlate,
  normalisePlate,
  SCAN2PAY_BASE_URL,
  wallClockParts,
} from '@/lib/parking'
import { registerParking } from '@/lib/scan2pay.server'
import { parkingHealthForVenue } from '@/lib/parking-health.server'

const BLOCKING_STATUSES = ['CONFIRMED', 'ALREADY_ACTIVE'] as const

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await prisma.parkingConfig.findUnique({
    where: { venueId: session.venueId },
  })
  if (!config || !config.enabled || config.deletedAt) {
    return NextResponse.json({ enabled: false })
  }

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const timezone = venue?.timezone || 'Pacific/Auckland'
  const now = new Date()
  const today = wallClockParts(now, timezone).date

  const rows = await prisma.parkingRegistration.findMany({
    where: { venueId: session.venueId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })
  const registrations = rows.filter(
    (row) => wallClockParts(row.createdAt, timezone).date === today,
  )

  return NextResponse.json({
    enabled: true,
    config: {
      carparkId: config.carparkId,
      carparkName: config.carparkName,
      durationMinutes: config.durationMinutes,
    },
    health: await parkingHealthForVenue(session.venueId, now),
    timezone,
    today,
    registrations,
  })
}

export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await prisma.parkingConfig.findUnique({
    where: { venueId: session.venueId },
  })
  if (!config || !config.enabled || config.deletedAt) {
    return NextResponse.json({ error: 'PARKING NOT ENABLED' }, { status: 403 })
  }
  if (!config.carparkId) {
    return NextResponse.json({ error: 'PARKING IS NOT CONFIGURED' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const plate = normalisePlate(typeof body.licensePlate === 'string' ? body.licensePlate : '')
  if (!isValidPlate(plate)) {
    return NextResponse.json(
      { error: 'NUMBER PLATE MUST BE 1–6 LETTERS OR DIGITS' },
      { status: 422 },
    )
  }

  const arrivedAt = new Date(typeof body.arrivedAt === 'string' ? body.arrivedAt : '')
  if (Number.isNaN(arrivedAt.getTime())) {
    return NextResponse.json({ error: 'ARRIVAL TIME IS NOT VALID' }, { status: 422 })
  }

  const now = new Date()
  const arrivalCheck = checkArrival(arrivedAt, now, config.durationMinutes)
  if (arrivalCheck.error) {
    return NextResponse.json({ error: arrivalCheck.error }, { status: 422 })
  }

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const timezone = venue?.timezone || 'Pacific/Auckland'
  const today = wallClockParts(now, timezone).date

  const recent = await prisma.parkingRegistration.findMany({
    where: { venueId: session.venueId, licensePlate: plate, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const duplicate = recent.find(
    (row) =>
      wallClockParts(row.createdAt, timezone).date === today &&
      (BLOCKING_STATUSES as readonly string[]).includes(row.status),
  )

  const extendUrl = buildSelectTimeUrl({
    baseUrl: SCAN2PAY_BASE_URL,
    carparkId: config.carparkId,
    carparkName: config.carparkName,
    plate,
  })

  if (duplicate) {
    return NextResponse.json(
      {
        error: 'THIS PLATE IS ALREADY REGISTERED TODAY',
        registration: duplicate,
        extendUrl,
        timezone,
      },
      { status: 409 },
    )
  }

  const result = await registerParking({
    target: {
      baseUrl: SCAN2PAY_BASE_URL,
      carparkId: config.carparkId,
      carparkName: config.carparkName,
      durationMinutes: config.durationMinutes,
    },
    plate,
    arrivedAt,
    timezone,
  })

  const registration = await prisma.parkingRegistration.create({
    data: {
      venueId: session.venueId,
      staffId: session.staffId,
      licensePlate: plate,
      carparkId: config.carparkId,
      carparkName: config.carparkName,
      arrivedAt,
      startsAt: result.window.startsAt,
      expiresAt: result.window.expiresAt,
      durationMinutes: config.durationMinutes,
      status: result.status,
      confirmationRef: result.confirmationRef ?? null,
      responseSnippet: result.snippet || null,
      httpStatus: result.httpStatus,
    },
  })

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, result, registration, extendUrl },
      { status: 502 },
    )
  }

  return NextResponse.json({ result, registration, extendUrl, timezone })
}
