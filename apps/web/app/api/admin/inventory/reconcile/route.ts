import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId = session.user.venueId

  // Find completed orders with exploded ingredient data
  // (stored in WooOrderItem.notes as JSON by the webhook handler)
  const orderItems = await prisma.wooOrderItem.findMany({
    where: {
      notes: { not: null },
      order: { venueId, status: 'COMPLETED', deletedAt: null },
    },
    include: {
      order: { select: { wooOrderId: true } },
      menuItem: { select: { name: true } },
    },
  })

  // Parse exploded ingredients from each order item
  const tally = new Map<string, { requiredBaseQty: number; itemName?: string }>()
  let ordersProcessed = 0
  const processedOrders = new Set<string>()

  for (const li of orderItems) {
    try {
      const parsed = JSON.parse(li.notes!)
      if (parsed.explodedIngredients && Array.isArray(parsed.explodedIngredients)) {
        for (const ing of parsed.explodedIngredients) {
          const existing = tally.get(ing.inventoryItemId)
          if (existing) {
            existing.requiredBaseQty += ing.requiredBaseQty
          } else {
            tally.set(ing.inventoryItemId, { requiredBaseQty: ing.requiredBaseQty })
          }
        }
        processedOrders.add(li.order.wooOrderId)
      }
    } catch {
      // Skip unparseable notes
    }
  }

  const details = []
  for (const [itemId, { requiredBaseQty }] of tally) {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, totalQty: true },
    })
    details.push({
      inventoryItemId: itemId,
      name: item?.name ?? 'Unknown',
      currentQty: item?.totalQty ?? 0,
      requiredBaseQty,
    })
  }

  return NextResponse.json({
    reconciledCount: tally.size,
    ordersProcessed: processedOrders.size,
    details,
  })
}
