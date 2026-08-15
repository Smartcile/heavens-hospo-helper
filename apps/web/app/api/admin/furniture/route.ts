import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import {
  furnitureInclude,
  toFurnitureView,
  placedCounts,
  furnitureCategoryId,
  normaliseShape,
  parseVertices,
  parseTableNumbers,
  jsonOrNull,
  isFurnitureType,
  writeBom,
} from '@/lib/furniture-server'
import { guardAccess } from '@/lib/permissions'

/**
 * Furniture is an InventoryItem with geometry set. This route is the planner's
 * view of that one table — there is no separate profile record any more.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const managerVenueId = getManagerVenueId(session, req)
  const venueId = managerVenueId ?? searchParams.get('venueId')
  const type = searchParams.get('type') // e.g. ?type=CHAIR for the chair picker

  const rows = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      furnitureType: type && isFurnitureType(type) ? type : { not: null },
      ...(venueId ? { venueId } : {}),
    },
    include: furnitureInclude,
    orderBy: [{ furnitureType: 'asc' }, { name: 'asc' }],
  })

  const placed = await placedCounts(venueId)
  return NextResponse.json(rows.map((r) => toFurnitureView(r, placed.get(r.id) ?? 0)))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.create')
  if (denied) return denied

  const body = await req.json()
  const name = typeof body.name === 'string' ? body.name.trim().toUpperCase() : ''
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const managerVenueId = getManagerVenueId(session, req)
  const venueId = managerVenueId ?? body.venueId ?? session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const categoryId = body.categoryId ?? (await furnitureCategoryId(venueId))
  const vertices = parseVertices(body.vertices)
  const shape = normaliseShape(body.shape)

  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.create({
      data: {
        venueId,
        categoryId,
        name,
        unit: 'EA',
        totalQty: Number(body.totalQty) || 0,
        furnitureType: isFurnitureType(body.furnitureType) ? body.furnitureType : 'TABLE',
        elementWidth: Number(body.width) || 80,
        elementDepth: Number(body.depth) || 80,
        elementShape: shape,
        elementVertices: shape === 'POLYGON' ? jsonOrNull(vertices) : jsonOrNull(null),
        defaultColour: body.colour ?? '#e6c347',
        defaultChairCount: Number(body.defaultChairCount) || 0,
        seatingDensity: body.seatingDensity != null ? Number(body.seatingDensity) : null,
        maxHeadChairs: Number(body.maxHeadChairs) || 1,
        tableNumbers: jsonOrNull(parseTableNumbers(body.tableNumbers)),
        chairItemId: body.chairItemId || null,
      },
    })

    await writeBom(tx, item.id, body.bomItems)

    return tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id }, include: furnitureInclude })
  })

  return NextResponse.json(toFurnitureView(created), { status: 201 })
}
