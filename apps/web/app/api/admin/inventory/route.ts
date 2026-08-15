import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.view')
  if (denied) return denied

  const url = new URL(req.url)
  const categoryId = url.searchParams.get('categoryId')
  const furnitureOnly = url.searchParams.get('furniture') === 'true'
  const deleted = url.searchParams.get('deleted') === 'true'
  const venueId = url.searchParams.get('venueId')

  const where: any = {}
  if (deleted) { where.deletedAt = { not: null } } else { where.deletedAt = null }
  if (categoryId) where.categoryId = categoryId
  if (furnitureOnly) where.furnitureType = { not: null }

  if (session.user.role === 'MANAGER') {
    where.venueId = session.user.venueId
  } else if (venueId) {
    where.venueId = venueId
  }

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
  const denied = await guardAccess(session, req, 'ops.inventory.create')
  if (denied) return denied

  const { name, categoryId, unit, defaultParLevel, totalQty, furnitureType, elementWidth, elementDepth, elementShape, defaultColour, defaultChairCount, countingUnitId, orderingUnitId, yieldPercentage, costPrice, expiryDate, fallbackCategoryId, allergyInfo, imageUrls, storageSectionId, storageNotes, serialNumber, purchaseDate, warrantyExpiry, serviceIntervalDays, lastServicedAt, nextServiceAt, maintenanceNotes, supplierId, shelfLifeDays, canFreeze, freezerShelfLifeDays, densityGramsPerMl, weightPerUnitGrams, venueId: bodyVenueId } = await req.json()
  if (!name || !categoryId) {
    return NextResponse.json({ error: 'name and categoryId are required' }, { status: 400 })
  }

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)

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
      venueId,
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
      imageUrls: Array.isArray(imageUrls) ? imageUrls : undefined,
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
      shelfLifeDays: shelfLifeDays ? parseInt(String(shelfLifeDays)) || null : null,
      canFreeze: !!canFreeze,
      freezerShelfLifeDays: freezerShelfLifeDays ? parseInt(String(freezerShelfLifeDays)) || null : null,
      densityGramsPerMl: densityGramsPerMl != null && densityGramsPerMl !== '' ? parseFloat(String(densityGramsPerMl)) : null,
      weightPerUnitGrams: weightPerUnitGrams != null && weightPerUnitGrams !== '' ? parseFloat(String(weightPerUnitGrams)) : null,
    },
  })
  return NextResponse.json(item, { status: 201 })
}
