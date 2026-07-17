import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// ── FOH Operations View ───────────────────────────────────────────────
// Returns orders for a date grouped by table with category totals.
//
// GET /api/admin/orders/foh?date=YYYY-MM-DD
// ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dateStr = req.nextUrl.searchParams.get('date')
  if (!dateStr) {
    return NextResponse.json({ error: 'date query parameter required (YYYY-MM-DD)' }, { status: 400 })
  }

  const dateStart = new Date(dateStr + 'T00:00:00.000Z')
  const dateEnd = new Date(dateStr + 'T23:59:59.999Z')

  if (isNaN(dateStart.getTime())) {
    return NextResponse.json({ error: 'invalid date format' }, { status: 400 })
  }

  const orders = await prisma.wooOrder.findMany({
    where: {
      venueId: session.user.venueId,
      fulfillmentDate: { gte: dateStart, lte: dateEnd },
      deletedAt: null,
    },
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, price: true, dietaryInfo: true, recipeId: true } },
        },
      },
      calendarEvent: {
        include: {
          setups: {
            include: {
              items: {
                where: { deletedAt: null },
                include: { tableProfile: { select: { id: true, name: true, capacity: true } } },
                orderBy: { assignedNumber: 'asc' },
              },
            },
          },
        },
      },
    },
    orderBy: { fulfillmentDate: 'asc' },
  })

  const result = []

  for (const order of orders) {
    const tables: { number: string; capacity: number }[] = []

    if (order.calendarEvent?.setups) {
      for (const setup of order.calendarEvent.setups) {
        for (const si of setup.items) {
          if (si.assignedNumber) {
            tables.push({ number: si.assignedNumber, capacity: si.tableProfile?.capacity ?? 0 })
          }
        }
      }
    }

    const lineItems = order.items.map((i) => ({
      id: i.id,
      menuItemName: i.menuItem?.name ?? 'UNKNOWN',
      menuItemId: i.menuItem?.id ?? null,
      dietaryInfo: i.menuItem?.dietaryInfo ?? null,
      recipeId: i.menuItem?.recipeId ?? null,
      kitchenStatus: i.kitchenStatus,
      qty: i.qty,
      unitPrice: i.unitPrice,
    }))

    result.push({
      id: order.id,
      wooOrderId: order.wooOrderId,
      customerName: order.customerName,
      partySize: order.partySize,
      status: order.status,
      totalAmount: order.totalAmount,
      tables,
      items: lineItems,
      calendarEventId: order.calendarEventId,
    })
  }

  const categoryTotals: Record<string, { total: number; items: { name: string; qty: number }[] }> = {}

  for (const order of orders) {
    for (const item of order.items) {
      if (!item.menuItem?.recipeId) continue

      const recipe = await prisma.recipe.findUnique({
        where: { id: item.menuItem.recipeId },
        include: {
          lineItems: {
            include: {
              inventoryItem: { include: { category: { select: { name: true } } } },
            },
          },
        },
      })

      if (!recipe) continue

      const categories = new Set<string>()
      for (const li of recipe.lineItems) {
        if (li.inventoryItem?.category?.name) {
          categories.add(li.inventoryItem.category.name)
        }
      }

      for (const cat of categories) {
        if (!categoryTotals[cat]) {
          categoryTotals[cat] = { total: 0, items: [] }
        }
        categoryTotals[cat].total += item.qty
        const existing = categoryTotals[cat].items.find((x) => x.name === item.menuItem!.name)
        if (existing) {
          existing.qty += item.qty
        } else {
          categoryTotals[cat].items.push({ name: item.menuItem!.name, qty: item.qty })
        }
      }
    }
  }

  return NextResponse.json({ orders: result, categoryTotals })
}
