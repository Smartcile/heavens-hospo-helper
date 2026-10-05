import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { isWithinGeoFence } from '@/lib/geo'
import { resolveClockPosition } from '@/lib/clock-position.server'

export async function POST(req: Request) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.timeClock.findFirst({
    where: { staffId: session.staffId, isActive: true, deletedAt: null },
  })
  if (existing) {
    return NextResponse.json({ error: 'ALREADY CLOCKED IN' }, { status: 409 })
  }

  const body = await req.json()
  const { lat, lon } = body

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { geoLat: true, geoLon: true, geoRadius: true },
  })

  const geoValid = lat != null && lon != null
    ? isWithinGeoFence(lat, lon, venue?.geoLat ?? null, venue?.geoLon ?? null, venue?.geoRadius ?? null)
    : true

  const note = lat == null || lon == null ? 'GPS NOT AVAILABLE' : geoValid ? null : 'OUTSIDE VENUE GEO-FENCE'
  const now = new Date()
  const positionId = await resolveClockPosition(session.staffId, session.venueId, now)

  const tc = await prisma.timeClock.create({
    data: {
      staffId: session.staffId,
      venueId: session.venueId,
      positionId,
      clockIn: now,
      clockInLat: lat ?? null,
      clockInLon: lon ?? null,
      geoValid,
      note,
    },
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
  })

  return NextResponse.json(tc, { status: 201 })
}
