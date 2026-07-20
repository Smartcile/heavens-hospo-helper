import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, categoryId, unit, defaultParLevel, totalQty, furnitureType, elementWidth, elementDepth, elementShape, defaultColour, defaultChairCount, countingUnitId, orderingUnitId, yieldPercentage, costPrice, expiryDate, fallbackCategoryId, allergyInfo, imageUrls, storageSectionId, storageNotes, serialNumber, purchaseDate, warrantyExpiry, serviceIntervalDays, lastServicedAt, nextServiceAt, maintenanceNotes, supplierId, shelfLifeDays, canFreeze, freezerShelfLifeDays } = await req.json()

  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = name.toUpperCase().trim()
  if (categoryId !== undefined) data.categoryId = categoryId
  if (unit !== undefined) data.unit = unit
  if (defaultParLevel !== undefined) data.defaultParLevel = parseInt(String(defaultParLevel)) || 0
  if (totalQty !== undefined) data.totalQty = parseInt(String(totalQty)) || 0
  if (furnitureType !== undefined) data.furnitureType = furnitureType || null
  if (elementWidth !== undefined) data.elementWidth = parseFloat(String(elementWidth)) || null
  if (elementDepth !== undefined) data.elementDepth = parseFloat(String(elementDepth)) || null
  if (elementShape !== undefined) data.elementShape = elementShape || null
  if (defaultColour !== undefined) data.defaultColour = defaultColour || null
  if (defaultChairCount !== undefined) data.defaultChairCount = parseInt(String(defaultChairCount)) || 0
  if (countingUnitId !== undefined) data.countingUnitId = countingUnitId || null
  if (orderingUnitId !== undefined) data.orderingUnitId = orderingUnitId || null
  if (yieldPercentage !== undefined) data.yieldPercentage = yieldPercentage ? parseFloat(String(yieldPercentage)) : null
  if (costPrice !== undefined) data.costPrice = costPrice ? parseFloat(String(costPrice)) : null
  if (expiryDate !== undefined) data.expiryDate = expiryDate ? new Date(expiryDate) : null
  if (fallbackCategoryId !== undefined) data.fallbackCategoryId = fallbackCategoryId || null
  if (allergyInfo !== undefined) data.allergyInfo = allergyInfo || null

  // Equipment / tool tracking
  if (imageUrls !== undefined) data.imageUrls = Array.isArray(imageUrls) ? imageUrls : undefined
  if (storageSectionId !== undefined) data.storageSectionId = storageSectionId || null
  if (storageNotes !== undefined) data.storageNotes = storageNotes || null
  if (serialNumber !== undefined) data.serialNumber = serialNumber || null
  if (purchaseDate !== undefined) data.purchaseDate = purchaseDate ? new Date(purchaseDate) : null
  if (warrantyExpiry !== undefined) data.warrantyExpiry = warrantyExpiry ? new Date(warrantyExpiry) : null
  if (serviceIntervalDays !== undefined) data.serviceIntervalDays = serviceIntervalDays ? parseInt(String(serviceIntervalDays)) || null : null
  if (lastServicedAt !== undefined) data.lastServicedAt = lastServicedAt ? new Date(lastServicedAt) : null
  // Auto-compute nextServiceAt from lastServicedAt + serviceIntervalDays unless explicitly provided
  if (nextServiceAt != null && nextServiceAt !== '') {
    data.nextServiceAt = new Date(nextServiceAt)
  } else if (data.lastServicedAt && data.serviceIntervalDays) {
    const next = new Date(data.lastServicedAt as Date)
    next.setDate(next.getDate() + (data.serviceIntervalDays as number))
    data.nextServiceAt = next
  } else {
    data.nextServiceAt = null
  }
  if (maintenanceNotes !== undefined) data.maintenanceNotes = maintenanceNotes || null
  if (supplierId !== undefined) data.supplierId = supplierId || null

  // Food shelf life
  if (shelfLifeDays !== undefined) data.shelfLifeDays = shelfLifeDays ? parseInt(String(shelfLifeDays)) || null : null
  if (canFreeze !== undefined) data.canFreeze = !!canFreeze
  if (freezerShelfLifeDays !== undefined) data.freezerShelfLifeDays = freezerShelfLifeDays ? parseInt(String(freezerShelfLifeDays)) || null : null

  const updated = await prisma.inventoryItem.update({
    where: { id: params.id },
    data,
    include: { category: true },
  })

  // Log maintenance if notes were provided
  if (maintenanceNotes !== undefined && maintenanceNotes && maintenanceNotes.trim()) {
    await prisma.maintenanceLog.create({
      data: {
        inventoryItemId: params.id,
        staffId: (session.user as any)?.id ?? null,
        note: String(maintenanceNotes).trim(),
      },
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const permanent = req.nextUrl.searchParams.get('permanent') === '1'

  const item = await prisma.inventoryItem.findFirst({
    where: { id: params.id },
    select: { id: true, venueId: true },
  })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && item.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (permanent) {
    // Hard delete — permanently remove
    await prisma.inventoryItem.delete({ where: { id: params.id } })
  } else {
    await prisma.inventoryItem.update({
      where: { id: params.id },
      data: { deletedAt: new Date() },
    })
  }
  return NextResponse.json({ ok: true })
}
