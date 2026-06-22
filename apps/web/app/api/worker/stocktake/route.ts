import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET(req: NextRequest) {
  const payload = await getWorkerSession()
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pending = await prisma.stocktakeRecord.findMany({
    where: {
      venueId: payload.venueId,
      deletedAt: null,
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      OR: [
        { assignedStaffId: payload.staffId },
        { assignedStaffId: null },
      ],
    },
    select: { id: true, date: true, status: true, notes: true, _count: { select: { lineItems: true } } },
    orderBy: { date: 'desc' },
  })

  return NextResponse.json(pending)
}
