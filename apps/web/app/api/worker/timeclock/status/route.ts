import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const active = await prisma.timeClock.findFirst({
    where: { staffId: session.staffId, isActive: true, deletedAt: null },
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
  })

  const activeBreak = active
    ? await prisma.timeClockBreak.findFirst({
        where: { timeClockId: active.id, endAt: null, deletedAt: null },
        select: { id: true, startAt: true },
      })
    : null

  let todayMinutes = 0
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todaySessions = await prisma.timeClock.findMany({
    where: {
      staffId: session.staffId,
      isActive: false,
      clockOut: { not: null },
      clockIn: { gte: todayStart },
      deletedAt: null,
    },
    select: { clockIn: true, clockOut: true },
  })

  for (const s of todaySessions) {
    if (!s.clockOut) continue
    todayMinutes += (s.clockOut.getTime() - s.clockIn.getTime()) / 60000
  }

  const recent = await prisma.timeClock.findMany({
    where: { staffId: session.staffId, deletedAt: null },
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
    orderBy: { clockIn: 'desc' },
    take: 7,
  })

  return NextResponse.json({
    isClockedIn: !!active,
    activeSession: active,
    activeBreak,
    todayMinutes,
    recentSessions: recent,
  })
}
