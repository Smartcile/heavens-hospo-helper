import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getManagerVenueId } from '@/lib/venue-scope'
import {
  furnitureInclude,
  toFurnitureView,
  placedCounts,
  normaliseShape,
  parseVertices,
  parseTableNumbers,
  jsonOrNull,
  isFurnitureType,
  writeBom,
} from '@/lib/furniture-server'
import { guardAccess } from '@/lib/permissions'

interface Params { params: { id: string } }

async function loadScoped(id: string, managerVenueId: string | null) {
  const row = await prisma.inventoryItem.findFirst({
    where: { id, deletedAt: null, ...(managerVenueId ? { venueId: managerVenueId } : {}) },
    include: furnitureInclude,
  })
  return row
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.view')
  if (denied) return denied

  const row = await loadScoped(params.id, getManagerVenueId(session, req))
  if (!row) return NextResponse.json({ error: 'Furniture not found' }, { status: 404 })

  const placed = await placedCounts(row.venueId)
  return NextResponse.json(toFurnitureView(row, placed.get(row.id) ?? 0))
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.edit')
  if (denied) return denied

  const existing = await loadScoped(params.id, getManagerVenueId(session, req))
  if (!existing) return NextResponse.json({ error: 'Furniture not found' }, { status: 404 })

  const body = await req.json()
  const shape = normaliseShape(body.shape ?? existing.elementShape)
  const vertices = parseVertices(body.vertices)

  // A piece can't be seated by itself.
  const chairItemId = body.chairItemId && body.chairItemId !== params.id ? body.chairItemId : null

  const updated = await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: params.id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim()
          ? { name: body.name.trim().toUpperCase() }
          : {}),
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
        ...(body.totalQty != null ? { totalQty: Number(body.totalQty) || 0 } : {}),
        ...(isFurnitureType(body.furnitureType) ? { furnitureType: body.furnitureType } : {}),
        ...(body.width != null ? { elementWidth: Number(body.width) || 80 } : {}),
        ...(body.depth != null ? { elementDepth: Number(body.depth) || 80 } : {}),
        elementShape: shape,
        // Vertices only mean anything on a polygon; clear them otherwise so a
        // shape switched back to RECTANGLE doesn't keep drawing its old outline.
        elementVertices: shape === 'POLYGON' ? jsonOrNull(vertices) : jsonOrNull(null),
        ...(body.colour !== undefined ? { defaultColour: body.colour } : {}),
        ...(body.defaultChairCount != null
          ? { defaultChairCount: Number(body.defaultChairCount) || 0 }
          : {}),
        ...(body.seatingDensity !== undefined
          ? { seatingDensity: body.seatingDensity != null ? Number(body.seatingDensity) : null }
          : {}),
        ...(body.maxHeadChairs != null ? { maxHeadChairs: Number(body.maxHeadChairs) || 1 } : {}),
        ...(body.tableNumbers !== undefined
          ? { tableNumbers: jsonOrNull(parseTableNumbers(body.tableNumbers)) }
          : {}),
        ...(body.chairItemId !== undefined ? { chairItemId } : {}),
      },
    })

    await writeBom(tx, params.id, body.bomItems)

    return tx.inventoryItem.findUniqueOrThrow({ where: { id: params.id }, include: furnitureInclude })
  })

  const placed = await placedCounts(updated.venueId)
  return NextResponse.json(toFurnitureView(updated, placed.get(updated.id) ?? 0))
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.delete')
  if (denied) return denied

  const existing = await loadScoped(params.id, getManagerVenueId(session, req))
  if (!existing) return NextResponse.json({ error: 'Furniture not found' }, { status: 404 })

  // Deleting furniture that is still on a layout would leave placements
  // pointing at nothing, so say what's in the way instead of breaking the plan.
  const placed = await prisma.setupItem.count({
    where: { furnitureItemId: params.id, deletedAt: null, setup: { deletedAt: null } },
  })
  if (placed > 0) {
    return NextResponse.json(
      { error: `STILL PLACED ON ${placed} TABLE LAYOUT SPOT${placed === 1 ? '' : 'S'} — REMOVE IT FROM THE PLAN FIRST` },
      { status: 409 },
    )
  }

  await prisma.inventoryItem.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
