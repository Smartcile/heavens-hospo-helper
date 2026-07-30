import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { jwtVerify } from 'jose'

async function getVenueId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('hospo-worker-session')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.WORKER_SESSION_SECRET || '')
    const { payload } = await jwtVerify(token, secret)
    return (payload as { venueId: string }).venueId || null
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
    },
    orderBy: { fulfillmentDate: 'asc' },
  })

  const eventIds = [...new Set(orders.map((o) => o.calendarEventId).filter(Boolean))] as string[]
  const setups = eventIds.length > 0
    ? await prisma.floorPlanSetup.findMany({
        where: { calendarEventId: { in: eventIds }, deletedAt: null },
        include: {
          items: {
            where: { deletedAt: null },
            include: { tableProfile: { select: { capacity: true } } },
            orderBy: { assignedNumber: 'asc' },
          },
        },
      })
    : []

  const setupsByEvent = new Map<string, (typeof setups)>()
  for (const s of setups) {
    if (!s.calendarEventId) continue
    const arr = setupsByEvent.get(s.calendarEventId) ?? []
    arr.push(s)
    setupsByEvent.set(s.calendarEventId, arr)
  }

  const tableItems: Record<string, { tableNumber: string; items: { orderId: string; name: string; dietaryInfo: string | null; qty: number; kitchenStatus: string }[] }> = {}
  const unassignedItems: { orderId: string; name: string; dietaryInfo: string | null; qty: number; kitchenStatus: string }[] = []

  for (const order of orders) {
    const tables: string[] = []

    if (order.calendarEventId) {
      const eventSetups = setupsByEvent.get(order.calendarEventId) ?? []
      for (const setup of eventSetups) {
        for (const si of setup.items) {
          if (si.assignedNumber) tables.push(si.assignedNumber)
        }
      }
    }

    for (const item of order.items) {
      const entry = {
        // Manual orders carry no wooOrderId — fall back to the local reference.
        orderId: order.wooOrderId ?? order.orderNumber ?? order.id,
        name: item.menuItem?.name ?? 'UNKNOWN',
        dietaryInfo: item.menuItem?.dietaryInfo ?? null,
        qty: item.qty,
        kitchenStatus: item.kitchenStatus as string,
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
