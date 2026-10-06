import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { fetchProductSales } from '@/lib/swiftpos.server'
import { matchSalesToItems } from '@/lib/swiftpos'
import { computeSwiftPosConsumption } from '@/lib/swiftpos-consumption.server'
import { summariseServes } from '@/lib/menu-serves'
import { getTodayDate } from '@/lib/utils'
import { formatDateKey } from '@/lib/scheduling'

// What the POS sold for a date range, matched to products — the input to stock
// consumption. Reads SwiftDOSnet's /api/analytics/sales (groupBy=product) and
// joins each sale's Inventory_Code to a MenuItem via MenuItem.swiftPosId.
// See MENUS.md §8.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.view')
  if (denied) return denied

  const venueParam = req.nextUrl.searchParams.get('venueId')
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : venueParam || session.user.venueId

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, swiftPosBaseUrl: true, timezone: true },
  })
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  if (!venue.swiftPosBaseUrl) {
    return NextResponse.json(
      { error: 'SWIFTPOS NOT CONNECTED — SET THE SWIFTDOSNET URL ON THE VENUE' },
      { status: 400 },
    )
  }

  const today = formatDateKey(getTodayDate(venue.timezone))
  const from = req.nextUrl.searchParams.get('from') || today
  const to = req.nextUrl.searchParams.get('to') || today

  let sales
  try {
    sales = await fetchProductSales(venue.swiftPosBaseUrl, from, to)
  } catch (e) {
    return NextResponse.json(
      { error: `COULD NOT REACH SWIFTDOSNET: ${(e as Error).message}` },
      { status: 502 },
    )
  }

  const items = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: {
      id: true,
      name: true,
      swiftPosId: true,
      serves: {
        where: { deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: {
          method: true,
          label: true,
          qty: true,
          uom: { select: { name: true } },
          recipe: { select: { name: true } },
          inventoryItem: { select: { name: true } },
        },
      },
    },
  })

  const match = matchSalesToItems(sales, items)
  const servesById = new Map(items.map((i) => [i.id, summariseServes(i.serves)]))

  // ?drawdown=1 also expands every matched sale through its serves into the
  // stock it would consume (the consumption report).
  const consumption =
    req.nextUrl.searchParams.get('drawdown') === '1'
      ? await computeSwiftPosConsumption(venueId, sales)
      : null

  return NextResponse.json({
    from,
    to,
    products: items.length,
    mapped: items.filter((i) => i.swiftPosId).length,
    totalQty: match.totalQty,
    matchedQty: match.matchedQty,
    matched: match.matched.map((m) => ({
      ...m,
      serveSummary: m.itemId ? servesById.get(m.itemId) ?? null : null,
    })),
    unmatched: match.unmatched,
    ...(consumption ? { consumption } : {}),
  })
}
