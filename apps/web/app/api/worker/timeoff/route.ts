import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

// Staff submit a time-off request (starts PENDING).
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { startDate, endDate, reason } = body as { startDate: string; endDate: string; reason?: string }
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'START AND END DATES ARE REQUIRED' }, { status: 400 })
  }
  if (new Date(endDate) < new Date(startDate)) {
    return NextResponse.json({ error: 'END DATE IS BEFORE START DATE' }, { status: 400 })
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      staffId: session.staffId,
      venueId: session.venueId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: reason?.trim() || null,
      status: 'PENDING',
    },
  })

  return NextResponse.json(request, { status: 201 })
}
