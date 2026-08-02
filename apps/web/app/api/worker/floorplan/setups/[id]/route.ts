import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { prisma } from '@hospo-ops/db'
import { resolvePlacedFurniture } from '@/lib/furniture-server'

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
          furnitureItem: {
            select: {
              id: true, name: true, elementWidth: true, elementDepth: true,
              elementShape: true, elementVertices: true, defaultColour: true,
              defaultChairCount: true, seatingDensity: true, maxHeadChairs: true,
            },
          },
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
    // A placement whose furniture has been deleted is skipped rather than
    // drawn as a zero-size table in the middle of the room.
    items: setup.items.flatMap((i) => {
      const f = resolvePlacedFurniture(i)
      if (!f) return []
      return [{
        id: i.id,
        x: i.x,
        y: i.y,
        rotation: i.rotation,
        label: i.assignedNumber ?? f.name,
        width: f.width,
        depth: f.depth,
        shape: f.shape,
        vertices: f.vertices,
        colour: f.colour ?? '#555',
        chairCount: f.chairCount,
        chairs: i.chairs ?? null,
        furnitureItemId: i.furnitureItemId,
        tableProfileId: i.tableProfileId,
        tableGroupId: i.tableGroupId,
        sectionId: i.sectionId,
      }]
    }),
  }

  return NextResponse.json(result)
}
