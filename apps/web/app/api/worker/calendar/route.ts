import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'

// A worker's own upcoming (published) shifts. Time off now lives on the unified
// availability calendar (`/w/availability`).
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const today = getTodayDate(venue?.timezone)

  const shifts = await prisma.shift.findMany({
    where: { staffId: session.staffId, deletedAt: null, status: 'PUBLISHED', date: { gte: today } },
    include: { department: { select: { name: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: 60,
  })

  // Count of listed shifts this worker can pick up (dashboard tile badge).
  const positions = await prisma.staffPosition.findMany({
    where: { staffId: session.staffId },
    select: { positionId: true },
  })
  const openShiftCount = await prisma.openShift.count({
    where: {
      venueId: session.venueId,
      deletedAt: null,
      status: 'OPEN',
      date: { gte: today },
      OR: [{ positionId: null }, { positionId: { in: positions.map((p) => p.positionId) } }],
    },
  })

  return NextResponse.json({
    firstName: session.firstName,
    openShiftCount,
    shifts: shifts.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      departmentName: s.department?.name ?? null,
      note: s.note,
    })),
  })
}
