import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { resolveCustomer } from '@/lib/customer-match'
import { validateOrderAgainstMenu } from '@/lib/menu-rules'
import { autoLinkBooking } from '@/lib/order-booking-link'
import type { OrderView, OrderLineView } from '@/lib/order-views'

/*
 * One payload, four views.
 *
 * Everything the SERVICE / KITCHEN / FOH / PRODUCTION renderers need arrives in
 * a fixed number of queries so switching view costs no round-trip, and adding
 * orders does not add queries. (The previous implementation fetched every order
 * ever with no date filter, and ran a recipe lookup per line item.)
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const dateStr = req.nextUrl.searchParams.get('date')
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date query parameter required (YYYY-MM-DD)' }, { status: 400 })
  }
  const serviceDate = new Date(`${dateStr}T00:00:00.000Z`)

  // ── 1. Orders for the service date ──
  const rows = await prisma.wooOrder.findMany({
    where: { venueId, serviceDate, deletedAt: null },
    include: {
      menu: { select: { name: true } },
      // A linked reservation is the authoritative seating — its tables win over
      // any layout auto-generated for the order itself.
      booking: {
        select: {
          id: true,
          startTime: true,
          contactName: true,
          tables: { select: { setupItem: { select: { assignedNumber: true } } } },
        },
      },
      items: {
        include: {
          menuItem: { select: { id: true, name: true, dietaryInfo: true, recipeId: true } },
        },
      },
    },
    orderBy: [{ serviceTime: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  })

  // ── 2. Table assignments via the CalendarEvent → FloorPlanSetup chain ──
  const eventIds = [...new Set(rows.map((o) => o.calendarEventId).filter(Boolean))] as string[]
  const setups = eventIds.length
    ? await prisma.floorPlanSetup.findMany({
        where: { calendarEventId: { in: eventIds }, deletedAt: null },
        select: {
          calendarEventId: true,
          items: {
            where: { deletedAt: null, assignedNumber: { not: null } },
            select: { assignedNumber: true },
            orderBy: { assignedNumber: 'asc' },
          },
        },
      })
    : []

  const tablesByEvent = new Map<string, string[]>()
  for (const s of setups) {
    if (!s.calendarEventId) continue
    const list = tablesByEvent.get(s.calendarEventId) ?? []
    for (const i of s.items) if (i.assignedNumber) list.push(i.assignedNumber)
    tablesByEvent.set(s.calendarEventId, list)
  }

  // ── 3. Inventory categories per menu item, in ONE query ──
  const recipeIds = [
    ...new Set(rows.flatMap((o) => o.items.map((i) => i.menuItem?.recipeId).filter(Boolean))),
  ] as string[]

  const recipes = recipeIds.length
    ? await prisma.recipe.findMany({
        where: { id: { in: recipeIds } },
        select: {
          id: true,
          lineItems: {
            select: { inventoryItem: { select: { category: { select: { name: true } } } } },
          },
        },
      })
    : []

  const categoriesByRecipe = new Map<string, string[]>()
  for (const r of recipes) {
    const names = new Set<string>()
    for (const li of r.lineItems) {
      const name = li.inventoryItem?.category?.name
      if (name) names.add(name)
    }
    categoriesByRecipe.set(r.id, [...names])
  }

  const categoryByMenuItem: [string, string[]][] = []
  const seenMenuItems = new Set<string>()
  for (const o of rows) {
    for (const i of o.items) {
      const mi = i.menuItem
      if (!mi || seenMenuItems.has(mi.id)) continue
      seenMenuItems.add(mi.id)
      categoryByMenuItem.push([mi.id, mi.recipeId ? categoriesByRecipe.get(mi.recipeId) ?? [] : []])
    }
  }

  const orders: OrderView[] = rows.map((o) => {
    const items: OrderLineView[] = o.items.map((i) => ({
      id: i.id,
      menuItemId: i.menuItem?.id ?? null,
      name: i.menuItem?.name ?? i.productName ?? 'UNKNOWN',
      qty: i.qty,
      unitPrice: i.unitPrice,
      dietaryInfo: i.menuItem?.dietaryInfo ?? null,
      customerNote: i.customerNote,
      allergenNote: i.allergenNote,
      kitchenStatus: i.kitchenStatus,
    }))

    return {
      id: o.id,
      ref: o.wooOrderId ? `#${o.wooOrderId}` : o.orderNumber ?? o.id.slice(0, 8).toUpperCase(),
      source: o.source,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerEmail: o.customerEmail,
      serviceTime: o.serviceTime,
      partySize: o.partySize,
      fulfillmentType: o.fulfillmentType,
      opStatus: o.opStatus,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalAmount: o.totalAmount,
      allergenNote: o.allergenNote,
      notes: o.notes,
      menuName: o.menu?.name ?? null,
      bookingId: o.bookingId,
      tables: bookingTables(o) ?? (o.calendarEventId ? tablesByEvent.get(o.calendarEventId) ?? [] : []),
      items,
    }
  })

  /*
   * Orders that arrived without a usable service date would otherwise be
   * invisible on a date-driven page. Surface the count so the operator can act
   * on it (usually a WooCommerce field-mapping problem) instead of silently
   * losing work.
   */
  const undatedCount = await prisma.wooOrder.count({
    where: { venueId, serviceDate: null, deletedAt: null, status: { not: 'CANCELLED' } },
  })

  return NextResponse.json({ date: dateStr, orders, categoryByMenuItem, undatedCount })
}

// ── Manual order creation ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const venueId =
    session.user.role === 'MANAGER' ? session.user.venueId : body.venueId || session.user.venueId

  if (!body.serviceDate || !/^\d{4}-\d{2}-\d{2}$/.test(body.serviceDate)) {
    return NextResponse.json({ error: 'serviceDate (YYYY-MM-DD) is required' }, { status: 400 })
  }

  const lines: { menuItemId: string; qty: number; unitPrice?: number; customerNote?: string; allergenNote?: string }[] =
    Array.isArray(body.items) ? body.items.filter((l: { menuItemId?: string }) => l?.menuItemId) : []

  const partySize = body.partySize == null || body.partySize === '' ? null : Number(body.partySize)

  // Menu rules are enforced here as well as in the browser — the client-side
  // check is for feedback, this one is the one that actually holds.
  if (body.menuId) {
    const menu = await prisma.menu.findFirst({
      where: { id: body.menuId, venueId, deletedAt: null },
      include: { items: { include: { menuItem: { select: { name: true } } } } },
    })
    if (!menu) return NextResponse.json({ error: 'Menu not found' }, { status: 404 })

    const violations = validateOrderAgainstMenu(
      { name: menu.name, minPax: menu.minPax, maxPax: menu.maxPax },
      menu.items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.menuItem.name,
        minQty: i.minQty,
        maxQty: i.maxQty,
      })),
      lines.map((l) => ({ menuItemId: l.menuItemId, qty: Number(l.qty) || 0 })),
      partySize,
    )

    if (violations.length > 0) {
      return NextResponse.json(
        { error: 'Order breaks the menu rules', violations },
        { status: 422 },
      )
    }
  }

  const customerId = await resolveCustomer(prisma, venueId, {
    name: body.customerName,
    email: body.customerEmail,
    phone: body.customerPhone,
  })

  const orderNumber = await nextOrderNumber(venueId)

  const totalAmount = lines.reduce(
    (sum, l) => sum + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0),
    0,
  )

  const order = await prisma.wooOrder.create({
    data: {
      venueId,
      source: body.source === 'PHONE' ? 'PHONE' : 'MANUAL',
      orderNumber,
      customerId,
      menuId: body.menuId || null,
      customerName: body.customerName ? String(body.customerName).toUpperCase().trim() : null,
      customerEmail: body.customerEmail || null,
      customerPhone: body.customerPhone || null,
      partySize,
      serviceDate: new Date(`${body.serviceDate}T00:00:00.000Z`),
      serviceTime: body.serviceTime || null,
      fulfillmentType: body.fulfillmentType || 'DINE_IN',
      status: 'PENDING',
      opStatus: body.opStatus || 'NEW',
      paymentStatus: body.paymentStatus || 'UNPAID',
      paymentMethod: body.paymentMethod || null,
      totalAmount,
      notes: body.notes || null,
      allergenNote: body.allergenNote || null,
      items: {
        create: lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: Number(l.qty) || 1,
          unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
          customerNote: l.customerNote || null,
          allergenNote: l.allergenNote || null,
        })),
      },
    },
  })

  // Best-effort — an unlinked order is a minor inconvenience, a failed save is not.
  try {
    await autoLinkBooking(prisma, order.id, venueId, order.serviceDate, {
      customerId,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      serviceTime: order.serviceTime,
    })
  } catch (e) {
    console.error('Booking auto-link failed (non-blocking):', e)
  }

  return NextResponse.json(order, { status: 201 })
}

/** Tables from a linked reservation, or null when there is no usable link. */
function bookingTables(order: {
  booking?: { tables: { setupItem: { assignedNumber: string | null } }[] } | null
}): string[] | null {
  if (!order.booking) return null
  const nums = order.booking.tables
    .map((t) => t.setupItem?.assignedNumber)
    .filter((n): n is string => !!n)
  return nums.length > 0 ? nums : null
}

/*
 * Sequential local reference (M-0001). Scoped per venue and derived from the
 * highest existing number so it survives deletions.
 */
async function nextOrderNumber(venueId: string): Promise<string> {
  const last = await prisma.wooOrder.findFirst({
    where: { venueId, orderNumber: { startsWith: 'M-' } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  })

  const n = last?.orderNumber ? parseInt(last.orderNumber.slice(2), 10) : 0
  return `M-${String((isNaN(n) ? 0 : n) + 1).padStart(4, '0')}`
}
