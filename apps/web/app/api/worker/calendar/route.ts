import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'

// A worker's own upcoming shifts + their time-off requests.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const today = getTodayDate(venue?.timezone)

  const [shifts, timeOff] = await Promise.all([
    prisma.shift.findMany({
      where: { staffId: session.staffId, deletedAt: null, date: { gte: today } },
      include: { department: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 60,
    }),
    prisma.timeOffRequest.findMany({
      where: { staffId: session.staffId, deletedAt: null },
      orderBy: { startDate: 'desc' },
      take: 30,
    }),
  ])

  return NextResponse.json({
    firstName: session.firstName,
    shifts: shifts.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      departmentName: s.department?.name ?? null,
      note: s.note,
    })),
    timeOff: timeOff.map((t) => ({
      id: t.id,
      startDate: t.startDate,
      endDate: t.endDate,
      reason: t.reason,
      status: t.status,
      reviewNote: t.reviewNote,
    })),
  })
}
