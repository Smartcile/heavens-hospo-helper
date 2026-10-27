import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { fetchProducts } from '@/lib/swiftpos.server'
import { buildProductLinks } from '@/lib/swiftpos-products'

// The SwiftPOS ↔ product mapping view. Reads the SwiftDOSnet product master and
// joins each `InventoryCode` to a local product via `MenuItem.swiftPosId`.
// Read-only against SwiftDOSnet; PUT only writes the local mapping column and
// deliberately does NOT push to WooCommerce (a POS code is not a Woo field).
// See MENUS.md §8.

function codeKey(code: string): string {
  return code.trim().toUpperCase()
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const venueId = scoped.venueId

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, name: true, swiftPosBaseUrl: true },
  })
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  if (!venue.swiftPosBaseUrl) {
    return NextResponse.json(
      { error: 'SWIFTPOS NOT CONNECTED — SET THE SWIFTDOSNET URL ON THE VENUE' },
      { status: 400 },
    )
  }

  let products
  try {
    products = await fetchProducts(venue.swiftPosBaseUrl)
  } catch (e) {
    return NextResponse.json(
      { error: `COULD NOT REACH SWIFTDOSNET: ${(e as Error).message}` },
      { status: 502 },
    )
  }

  const menuItems = await prisma.menuItem.findMany({
    where: { venueId, deletedAt: null },
    select: { id: true, name: true, swiftPosId: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json({
    venueId,
    venueName: venue.name,
    baseUrl: venue.swiftPosBaseUrl,
    total: products.total,
    truncated: products.truncated,
    menuItems,
    ...buildProductLinks(products.rows, menuItems, { truncated: products.truncated }),
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.edit')
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as {
    venueId?: string
    menuItemId?: string
    swiftPosId?: string | null
  } | null

  const menuItemId = String(body?.menuItemId ?? '').trim()
  if (!menuItemId) return NextResponse.json({ error: 'PRODUCT REQUIRED' }, { status: 400 })

  const item = await prisma.menuItem.findFirst({
    where: { id: menuItemId, deletedAt: null },
    select: { id: true, name: true, venueId: true },
  })
  if (!item) return NextResponse.json({ error: 'PRODUCT NOT FOUND' }, { status: 404 })

  const scoped = resolveScopedVenueId(session, req, body?.venueId ?? item.venueId)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (item.venueId !== scoped.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raw = typeof body?.swiftPosId === 'string' ? body.swiftPosId.trim() : ''
  const swiftPosId = raw || null

  if (swiftPosId) {
    const linked = await prisma.menuItem.findMany({
      where: { venueId: item.venueId, deletedAt: null, swiftPosId: { not: null } },
      select: { id: true, name: true, swiftPosId: true },
    })
    const key = codeKey(swiftPosId)
    const conflict = linked.find((m) => m.id !== item.id && m.swiftPosId && codeKey(m.swiftPosId) === key)
    if (conflict) {
      return NextResponse.json(
        { error: `${conflict.name} IS ALREADY LINKED TO SWIFTPOS CODE ${swiftPosId}` },
        { status: 409 },
      )
    }
  }

  const updated = await prisma.menuItem.update({
    where: { id: item.id },
    data: { swiftPosId },
    select: { id: true, name: true, swiftPosId: true },
  })

  return NextResponse.json({ ok: true, menuItem: updated })
}
