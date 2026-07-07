import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const venueScope = session.user.role === 'MANAGER' ? session.user.venueId : (venueId ?? undefined)

  const profiles = await prisma.tableProfile.findMany({
    where: { ...(venueScope ? { venueId: venueScope } : {}), deletedAt: null },
    include: { bomItems: { include: { item: { select: { id: true, name: true, unit: true } } } } },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(profiles)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, type, capacity, width, depth, shape, colour, chairCount, seatingDensity, maxHeadChairs, tableNumbers, bomItems } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const upperName = name.toUpperCase().trim()

  const profile = await prisma.$transaction(async (tx) => {
    // Find or create FURNITURE category
    let furnitureCat = await tx.inventoryCategory.findFirst({
      where: { name: 'FURNITURE', deletedAt: null, OR: [{ venueId: session.user.venueId }, { venueId: null }] },
    })
    if (!furnitureCat) {
      furnitureCat = await tx.inventoryCategory.create({
        data: { venueId: session.user.venueId, name: 'FURNITURE', isBuiltIn: false },
      })
    }

    // Create the TableProfile
    const p = await tx.tableProfile.create({
      data: {
        venueId: session.user.venueId,
        name: upperName,
        type: type ?? 'TABLE',
        capacity: capacity ?? 0,
        width: width ?? 80,
        depth: depth ?? 80,
        shape: shape ?? 'RECTANGLE',
        colour: colour ?? '#555',
        chairCount: chairCount ?? 0,
        seatingDensity: seatingDensity ?? null,
        maxHeadChairs: maxHeadChairs ?? 1,
        ...(Array.isArray(tableNumbers) && tableNumbers.length > 0 ? { tableNumbers } : {}),
        ...(bomItems?.length
          ? { bomItems: { create: bomItems.map((b: { inventoryItemId: string; quantity: number; perChair: boolean }) => ({ inventoryItemId: b.inventoryItemId, quantity: b.quantity, perChair: b.perChair ?? false })) } }
          : {}),
      },
      include: { bomItems: true },
    })

    // Clean up any orphaned inventory items with the same name (from previous broken renames)
    await tx.inventoryItem.updateMany({
      where: { name: upperName, venueId: session.user.venueId, deletedAt: null },
      data: { deletedAt: new Date() },
    })

    // Create corresponding InventoryItem so it shows in the inventory list
    const qty = Array.isArray(tableNumbers) && tableNumbers.length > 0 ? tableNumbers.length : 1
    await tx.inventoryItem.create({
      data: {
        venueId: session.user.venueId,
        categoryId: furnitureCat.id,
        name: upperName,
        unit: 'EA',
        totalQty: qty,
        furnitureType: type ?? 'TABLE',
        elementWidth: width ?? 80,
        elementDepth: depth ?? 80,
        elementShape: shape ?? 'RECTANGLE',
        defaultColour: colour ?? '#555',
        defaultChairCount: chairCount ?? 0,
      },
    })

    return p
  })

  return NextResponse.json(profile, { status: 201 })
}
