import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { verify } from 'jsonwebtoken'

// ── Worker Kitchen View ───────────────────────────────────────────────
// Returns today's order items grouped by table with dietary info.
//
// GET /api/worker/kitchen
// Auth: hospo-worker-session JWT cookie
// ──────────────────────────────────────────────────────────────────────

async function getVenueId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('hospo-worker-session')?.value
  if (!token) return null
  try {
    const payload = verify(token, process.env.WORKER_SESSION_SECRET || '') as { staffId: string; venueId: string }
    return payload.venueId || null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const venueId = await getVenueId(req)
  if (!venueId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)

  const orders = await prisma.wooOrder.findMany({
    where: {
      venueId,
      fulfillmentDate: { gte: todayStart, lte: todayEnd },
      deletedAt: null,
    },
    include: {
      items: {
        include: {
          menuItem: { select: { id: true, name: true, dietaryInfo: true } },
        },
      },
      calendarEvent: {
        include: {
          setups: {
            include: {
              items: {
                where: { deletedAt: null },
                include: { tableProfile: { select: { capacity: true } } },
                orderBy: { assignedNumber: 'asc' },
              },
            },
          },
        },
      },
    },
    orderBy: { fulfillmentDate: 'asc' },
  })

  const tableItems: Record<string, { tableNumber: string; items: { name: string; dietaryInfo: string | null; qty: number; kitchenStatus: string }[] }> = {}
  const unassignedItems: { orderId: string; name: string; dietaryInfo: string | null; qty: number; kitchenStatus: string }[] = []

  for (const order of orders) {
    const tables: string[] = []

    if (order.calendarEvent?.setups) {
      for (const setup of order.calendarEvent.setups) {
        for (const si of setup.items) {
          if (si.assignedNumber) tables.push(si.assignedNumber)
        }
      }
    }

    for (const item of order.items) {
      const entry = {
        orderId: order.wooOrderId,
        name: item.menuItem?.name ?? 'UNKNOWN',
        dietaryInfo: item.menuItem?.dietaryInfo ?? null,
        qty: item.qty,
        kitchenStatus: item.kitchenStatus,
      }

      if (tables.length > 0) {
        for (const t of tables) {
          if (!tableItems[t]) {
            tableItems[t] = { tableNumber: t, items: [] }
          }
          tableItems[t].items.push(entry)
        }
      } else {
        unassignedItems.push(entry)
      }
    }
  }

  const itemTotals: Record<string, { name: string; qty: number; dietaryInfo: string | null }> = {}
  for (const order of orders) {
    for (const item of order.items) {
      const name = item.menuItem?.name ?? 'UNKNOWN'
      if (!itemTotals[name]) {
        itemTotals[name] = { name, qty: 0, dietaryInfo: item.menuItem?.dietaryInfo ?? null }
      }
      itemTotals[name].qty += item.qty
    }
  }

  return NextResponse.json({
    tables: Object.values(tableItems),
    unassigned: unassignedItems,
    itemTotals: Object.values(itemTotals).sort((a, b) => b.qty - a.qty),
  })
}
