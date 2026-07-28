import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { prisma } from '@hospo-ops/db'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guide = await prisma.guide.findUnique({
    where: { id: params.id },
    select: { id: true, venueId: true, requiresSignOff: true, status: true, isTracked: true, deletedAt: true },
  })
  if (!guide || guide.deletedAt || guide.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'GUIDE NOT FOUND' }, { status: 404 })
  }
  if (guide.venueId !== session.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!guide.isTracked) {
    return NextResponse.json({ error: 'THIS GUIDE IS REFERENCE-ONLY' }, { status: 400 })
  }
  if (guide.requiresSignOff) {
    return NextResponse.json(
      { error: 'THIS GUIDE NEEDS A MANAGER TO SIGN OFF' },
      { status: 400 },
    )
  }

  const completion = await prisma.guideCompletion.upsert({
    where: { guideId_staffId: { guideId: params.id, staffId: session.staffId } },
    update: {},
    create: {
      guideId: params.id,
      staffId: session.staffId,
      selfCompleted: true,
    },
  })

  return NextResponse.json(completion, { status: 201 })
}
