import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.floorPlanSetup.findFirst({
    where: { id: params.id, deletedAt: null },
    include: {
      items: {
        where: { deletedAt: null, isActive: true },
        include: {
          tableProfile: {
            select: { id: true, name: true, width: true, depth: true, colour: true, chairCount: true },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      floorPlan: { select: { name: true } },
    },
  })

  if (!setup) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = {
    id: setup.id,
    name: setup.name,
    planName: setup.floorPlan.name,
    items: setup.items.map((i) => ({
      id: i.id,
      x: i.x,
      y: i.y,
      rotation: i.rotation,
      label: i.assignedNumber ?? i.tableProfile.name,
      width: i.tableProfile.width,
      depth: i.tableProfile.depth,
      colour: i.tableProfile.colour ?? '#555',
      chairCount: i.tableProfile.chairCount,
      tableProfileId: i.tableProfileId,
      tableGroupId: i.tableGroupId,
      sectionId: i.sectionId,
    })),
  }

  return NextResponse.json(result)
}
