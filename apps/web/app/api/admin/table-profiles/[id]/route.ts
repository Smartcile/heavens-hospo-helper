import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.tableProfile.findFirst({
    where: { id: params.id, deletedAt: null },
    include: { bomItems: { include: { item: { select: { id: true, name: true, unit: true } } } } },
  })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(profile)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const oldProfile = await prisma.tableProfile.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true, name: true },
  })
  if (!oldProfile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && oldProfile.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = String(body.name).toUpperCase().trim()
  if (body.type !== undefined) data.type = body.type
  if (body.capacity !== undefined) data.capacity = parseInt(String(body.capacity)) || 0
  if (body.width !== undefined) data.width = parseFloat(String(body.width)) || 80
  if (body.depth !== undefined) data.depth = parseFloat(String(body.depth)) || 80
  if (body.shape !== undefined) data.shape = body.shape
  if (body.colour !== undefined) data.colour = body.colour
  if (body.chairCount !== undefined) data.chairCount = parseInt(String(body.chairCount)) || 0
  if (body.seatingDensity !== undefined) data.seatingDensity = body.seatingDensity ? parseFloat(String(body.seatingDensity)) : null
  if (body.maxHeadChairs !== undefined) data.maxHeadChairs = parseInt(String(body.maxHeadChairs)) || 1
  if (body.tableNumbers !== undefined) {
    if (Array.isArray(body.tableNumbers) && body.tableNumbers.length > 0) data.tableNumbers = body.tableNumbers
  }

  const updated = await prisma.tableProfile.update({
    where: { id: params.id },
    data,
    include: { bomItems: true },
  })

  // Sync matching inventory item — find by OLD name (before rename), update to new name + fields
  const invItem = await prisma.inventoryItem.findFirst({
    where: { name: oldProfile.name, venueId: oldProfile.venueId, deletedAt: null },
  })
  if (invItem) {
    const invData: Record<string, unknown> = {}
    if (body.name !== undefined) invData.name = String(body.name).toUpperCase().trim()
    if (body.type !== undefined) invData.furnitureType = body.type
    if (body.width !== undefined) invData.elementWidth = parseFloat(String(body.width)) || 80
    if (body.depth !== undefined) invData.elementDepth = parseFloat(String(body.depth)) || 80
    if (body.shape !== undefined) invData.elementShape = body.shape
    if (body.colour !== undefined) invData.defaultColour = body.colour
    if (body.chairCount !== undefined) invData.defaultChairCount = parseInt(String(body.chairCount)) || 0
    if (body.tableNumbers !== undefined) {
      invData.totalQty = Array.isArray(body.tableNumbers) ? body.tableNumbers.length : 1
    }
    if (Object.keys(invData).length > 0) {
      await prisma.inventoryItem.update({ where: { id: invItem.id }, data: invData })
    }
  }

  // If name changed, remove any orphaned inventory items with the new name (from a previous broken rename)
  if (body.name !== undefined) {
    const newName = String(body.name).toUpperCase().trim()
    if (newName !== oldProfile.name) {
      await prisma.inventoryItem.updateMany({
        where: { name: newName, venueId: oldProfile.venueId, deletedAt: null, id: { not: invItem?.id } },
        data: { deletedAt: new Date() },
      })
    }
  }

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await prisma.tableProfile.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true, name: true },
  })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && profile.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.$transaction([
    prisma.tableProfile.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    }),
    prisma.inventoryItem.updateMany({
      where: { name: profile.name, venueId: profile.venueId, deletedAt: null },
      data: { deletedAt: new Date() },
    }),
  ])

  return NextResponse.json({ success: true })
}
