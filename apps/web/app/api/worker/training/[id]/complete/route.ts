import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

interface Params {
  params: { id: string }
}

// Staff self-completes a module — only allowed when it doesn't require manager
// sign-off, and only for a module that applies to them in their venue.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trainingModule = await prisma.trainingModule.findUnique({
    where: { id: params.id },
    select: { id: true, venueId: true, requiresSignOff: true, isActive: true, deletedAt: true },
  })
  if (!trainingModule || trainingModule.deletedAt || !trainingModule.isActive) {
    return NextResponse.json({ error: 'TRAINING NOT FOUND' }, { status: 404 })
  }
  if (trainingModule.venueId !== session.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (trainingModule.requiresSignOff) {
    return NextResponse.json(
      { error: 'THIS MODULE NEEDS A MANAGER TO SIGN OFF' },
      { status: 400 }
    )
  }

  const completion = await prisma.trainingCompletion.upsert({
    where: { moduleId_staffId: { moduleId: params.id, staffId: session.staffId } },
    update: {},
    create: {
      moduleId: params.id,
      staffId: session.staffId,
      selfCompleted: true,
    },
  })

  return NextResponse.json(completion, { status: 201 })
}
