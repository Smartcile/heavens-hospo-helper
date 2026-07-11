import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const days = Number(req.nextUrl.searchParams.get('days') ?? 7)

  const since = new Date()
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)

  const sessions = await prisma.timeClock.findMany({
    where: {
      staffId: session.staffId,
      clockIn: { gte: since },
      deletedAt: null,
    },
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
    orderBy: { clockIn: 'desc' },
  })

  return NextResponse.json(sessions)
}
