import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { normaliseOrderOptions } from '@/lib/order-options'
import { mergeDrawdown, type DrawdownChoice } from '@/lib/order-drawdown'
import { loadChoiceDrawdowns } from '@/lib/order-drawdown.server'

export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.inventory.view')
  if (denied) return denied

  const venueId = session.user.venueId

  // Completed order lines carry the recipe explosion computed at sync time and
  // the customer's option snapshot. The option drawdown is resolved from the
  // live choice rows below.
  const orderItems = await prisma.wooOrderItem.findMany({
    where: {
      order: { venueId, status: 'COMPLETED', deletedAt: null },
    },
    select: {
      orderId: true,
      qty: true,
      explodedIngredients: true,
      options: true,
    },
  })

  // Recursive recipe BOM result for the line, plus each selected choice's
  // additive drawdown (gram-aware). Read-only — #116 will post the deduction.
  const choiceIds = orderItems.flatMap((li) =>
    normaliseOrderOptions(li.options).map((o) => o.choiceId),
  )
  const drawdownByChoice = await loadChoiceDrawdowns(choiceIds)

  let tally = new Map<string, number>()
  const processedOrders = new Set<string>()

  for (const li of orderItems) {
    const blob = li.explodedIngredients as {
      ingredients?: { inventoryItemId: string; requiredBaseQty: number }[]
    } | null

    if (blob?.ingredients && Array.isArray(blob.ingredients)) {
      for (const ing of blob.ingredients) {
        tally.set(ing.inventoryItemId, (tally.get(ing.inventoryItemId) ?? 0) + ing.requiredBaseQty)
      }
    }

    const choices = normaliseOrderOptions(li.options)
      .map((o) => drawdownByChoice.get(o.choiceId))
      .filter((c): c is DrawdownChoice => !!c)

    tally = mergeDrawdown(tally, choices, li.qty || 1)

    if (blob?.ingredients?.length || choices.length > 0) processedOrders.add(li.orderId)
  }

  const details = []
  for (const [itemId, requiredBaseQty] of tally) {
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
