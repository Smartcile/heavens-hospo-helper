import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const planId = searchParams.get('planId')
  if (!planId) return NextResponse.json({ error: 'planId is required' }, { status: 400 })

  const setups = await prisma.floorPlanSetup.findMany({
    // Scope by the worker's venue, not just the plan id — a manager switching
    // venues must not read another venue's room photos.
    where: { floorPlanId: planId, deletedAt: null, floorPlan: { venueId: session.venueId, deletedAt: null } },
    select: {
      id: true,
      name: true,
      eventDate: true,
      roomName: true,
      guestCapacity: true,
      setupStyle: true,
      imageUrls: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(setups)
}
