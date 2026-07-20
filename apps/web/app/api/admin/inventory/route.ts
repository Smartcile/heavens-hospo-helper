import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const categoryId = url.searchParams.get('categoryId')
  const furnitureOnly = url.searchParams.get('furniture') === 'true'

  const where: any = { deletedAt: null, venueId: session.user.venueId }
  if (categoryId) where.categoryId = categoryId
  if (furnitureOnly) where.furnitureType = { not: null }
  if (session.user.role === 'ADMIN') delete where.venueId

  const items = await prisma.inventoryItem.findMany({
    where,
    include: { category: true, _count: { select: { elements: true } } },
    orderBy: { name: 'asc' },
  })
  const result = items.map(({ _count, ...item }) => ({ ...item, placedCount: _count.elements }))
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, categoryId, unit, defaultParLevel, totalQty, furnitureType, elementWidth, elementDepth, elementShape, defaultColour, defaultChairCount, countingUnitId, orderingUnitId, yieldPercentage, costPrice, expiryDate, fallbackCategoryId, allergyInfo, imageUrl, storageSectionId, storageNotes, serialNumber, purchaseDate, warrantyExpiry, serviceIntervalDays, lastServicedAt, nextServiceAt, maintenanceNotes, supplierId } = await req.json()
  if (!name || !categoryId) {
    return NextResponse.json({ error: 'name and categoryId are required' }, { status: 400 })
  }

  function computeNextService() {
    if (nextServiceAt) return new Date(nextServiceAt)
    if (lastServicedAt && serviceIntervalDays) {
      const d = new Date(lastServicedAt)
      d.setDate(d.getDate() + parseInt(String(serviceIntervalDays)))
      return d
    }
    return null
  }

  const item = await prisma.inventoryItem.create({
    data: {
      venueId: session.user.venueId,
      name: name.toUpperCase().trim(),
      categoryId,
      unit: unit ?? 'EA',
      defaultParLevel: defaultParLevel ?? 0,
      totalQty: totalQty ?? 0,
      furnitureType: furnitureType ?? null,
      elementWidth: elementWidth ?? null,
      elementDepth: elementDepth ?? null,
      elementShape: elementShape ?? null,
      defaultColour: defaultColour ?? null,
      defaultChairCount: defaultChairCount ?? 0,
      countingUnitId: countingUnitId || null,
      orderingUnitId: orderingUnitId || null,
      yieldPercentage: yieldPercentage ? parseFloat(String(yieldPercentage)) : null,
      costPrice: costPrice ? parseFloat(String(costPrice)) : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      fallbackCategoryId: fallbackCategoryId || null,
      allergyInfo: allergyInfo || null,
      imageUrl: imageUrl || null,
      storageSectionId: storageSectionId || null,
      storageNotes: storageNotes || null,
      serialNumber: serialNumber || null,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : null,
      serviceIntervalDays: serviceIntervalDays ? parseInt(String(serviceIntervalDays)) || null : null,
      lastServicedAt: lastServicedAt ? new Date(lastServicedAt) : null,
      nextServiceAt: computeNextService(),
      maintenanceNotes: maintenanceNotes || null,
      supplierId: supplierId || null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
