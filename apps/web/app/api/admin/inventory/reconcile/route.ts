import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.inventory.view')
  if (denied) return denied

  const venueId = session.user.venueId

  // Find completed orders with exploded ingredient data
  // (stored on WooOrderItem.explodedIngredients by the sync / webhook handler)
  const orderItems = await prisma.wooOrderItem.findMany({
    where: {
      order: { venueId, status: 'COMPLETED', deletedAt: null },
    },
    select: {
      orderId: true,
      explodedIngredients: true,
    },
  })

  // Tally exploded ingredients from each order item
  const tally = new Map<string, { requiredBaseQty: number; itemName?: string }>()
  const processedOrders = new Set<string>()

  for (const li of orderItems) {
    const blob = li.explodedIngredients as {
      ingredients?: { inventoryItemId: string; requiredBaseQty: number }[]
    } | null
    if (!blob?.ingredients || !Array.isArray(blob.ingredients)) continue

    for (const ing of blob.ingredients) {
      const existing = tally.get(ing.inventoryItemId)
      if (existing) {
        existing.requiredBaseQty += ing.requiredBaseQty
      } else {
        tally.set(ing.inventoryItemId, { requiredBaseQty: ing.requiredBaseQty })
      }
    }
    processedOrders.add(li.orderId)
  }

  const details = []
  for (const [itemId, { requiredBaseQty }] of tally) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, totalQty: true, densityGramsPerMl: true, weightPerUnitGrams: true },
    })
    // Canonical unit label: items with density data are exploded in grams by
    // explodeRecipe; everything else keeps base-unit quantities (ea, mL, ...).
    const unit = item?.densityGramsPerMl != null || item?.weightPerUnitGrams != null
      ? (requiredBaseQty >= 1000 ? 'KG' : 'G')
      : 'BASE'
    details.push({
      inventoryItemId: itemId,
      name: item?.name ?? 'Unknown',
      currentQty: item?.totalQty ?? 0,
      requiredBaseQty,
      unit,
    })
  }

  return NextResponse.json({
    reconciledCount: tally.size,
    ordersProcessed: processedOrders.size,
    details,
  })
}
