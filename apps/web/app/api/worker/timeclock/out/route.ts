import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { isWithinGeoFence } from '@/lib/geo'
import { recalcBreaksMinutes } from '@/lib/timeclock-breaks'

// Clocks the worker out of their active session. Any open break is closed
// first so the paid/unpaid split in payroll stays complete.
export async function POST(req: Request) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const active = await prisma.timeClock.findFirst({
    where: { staffId: session.staffId, isActive: true, deletedAt: null },
  })
  if (!active) {
    return NextResponse.json({ error: 'NOT CLOCKED IN' }, { status: 409 })
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

  // Close any open break so its minutes are counted.
  const openBreak = await prisma.timeClockBreak.findFirst({
    where: { timeClockId: active.id, endAt: null, deletedAt: null },
  })
  if (openBreak) {
    await prisma.timeClockBreak.update({ where: { id: openBreak.id }, data: { endAt: new Date() } })
  }

  const tc = await prisma.timeClock.update({
    where: { id: active.id },
    data: { clockOut: new Date(), clockOutLat: lat ?? null, clockOutLon: lon ?? null, geoValid, isActive: false },
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
  })

  await recalcBreaksMinutes(active.id)

  return NextResponse.json(tc)
}
