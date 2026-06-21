import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const viewSlug = searchParams.get('view')

  const where: Record<string, unknown> = {
    venueId: session.venueId,
    deletedAt: null,
    isActive: true,
  }
  if (viewSlug) {
    where.slug = viewSlug
  } else {
    where.isDefault = true
  }

  const plan = await prisma.floorPlan.findFirst({
    where,
    include: {
      elements: {
        where: { deletedAt: null, isActive: true },
        orderBy: [{ zIndex: 'asc' }, { sortOrder: 'asc' }],
        include: {
          section: { select: { id: true, name: true, colour: true } },
        },
      },
    },
  })

  if (!plan) return NextResponse.json({ plan: null, elements: [] })

  return NextResponse.json(plan)
}
