import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { prisma } from '@hospo-ops/db'
import { resolvePlacedFurniture } from '@/lib/furniture-server'
import { normaliseRoomSetupInput } from '@/lib/room-setup'

interface Params { params: { id: string } }

function canManage(role: string | undefined): boolean {
  return role === 'ADMIN' || role === 'MANAGER'
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setup = await prisma.floorPlanSetup.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      floorPlan: { venueId: session.venueId, deletedAt: null },
    },
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
    roomName: setup.roomName,
    guestCapacity: setup.guestCapacity,
    setupStyle: setup.setupStyle,
    imageUrls: setup.imageUrls,
    notes: setup.notes,
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

/**
 * Manager-only room-setup metadata edit from the worker view. Geometry stays
 * on the admin canvas, so the worker can describe/photo the room but cannot
 * move tables or invent a layout.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(session.role)) {
    return NextResponse.json({ error: 'MANAGERS ONLY' }, { status: 403 })
  }

  const setup = await prisma.floorPlanSetup.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      floorPlan: { venueId: session.venueId, deletedAt: null },
    },
    select: { id: true },
  })
  if (!setup) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name).toUpperCase().trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    data.name = name
  }
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === 'string' ? body.notes.trim() || null : body.notes
  }
  if (
    body.roomName !== undefined ||
    body.guestCapacity !== undefined ||
    body.setupStyle !== undefined ||
    body.imageUrls !== undefined
  ) {
    const room = normaliseRoomSetupInput(body)
    if (body.roomName !== undefined) data.roomName = room.roomName
    if (body.guestCapacity !== undefined) data.guestCapacity = room.guestCapacity
    if (body.setupStyle !== undefined) data.setupStyle = room.setupStyle
    if (body.imageUrls !== undefined) data.imageUrls = room.imageUrls
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await prisma.floorPlanSetup.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}
